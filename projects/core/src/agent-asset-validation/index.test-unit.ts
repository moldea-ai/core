// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from '../constants/index.js';
import type { IContentDigest, IIndexedTextAsset } from '../contracts/index.js';
import { countUnicodeScalars } from '../format-validation/index.js';

import { validateAgentDescription, validateAgentInstruction } from './index.js';

const AGENT_ID = 'agent-one';

const createAsset = (content: string, name: string): IIndexedTextAsset => ({
  content,
  digest: 'sha256:test' as IContentDigest,
  path: parseRepositoryPath(`/moldea/agents/${AGENT_ID}/${name}.md`),
  scalarLength: countUnicodeScalars(content),
  utf8ByteLength: new TextEncoder().encode(content).byteLength,
});

describe('Core agent description validation', () => {
  test('trims Unicode White_Space while preserving internal scalars', () => {
    const asset = createAsset('\u0085\u2003Owns 😀 support.\n\t', 'description');
    const result = validateAgentDescription(
      asset,
      AGENT_ID,
      'description',
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(result).toStrictEqual({
      description: { asset, scalarLength: 15, value: 'Owns 😀 support.' },
      diagnostics: [],
      valid: true,
    });
    expect(Object.isFrozen(result.description)).toBe(true);
  });

  test.each([
    ['x', 1],
    ['😀'.repeat(1_000), 1_000],
  ])('accepts inclusive scalar boundary content', (content, scalarLength) => {
    const result = validateAgentDescription(
      createAsset(content, 'description'),
      AGENT_ID,
      'description',
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(result.description).toMatchObject({ scalarLength, value: content });
    expect(result.valid).toBe(true);
  });

  test('reports every applicable description rule without truncation', () => {
    const content = `{{${'x'.repeat(1_000)}}}`;
    const result = validateAgentDescription(
      createAsset(content, 'description'),
      AGENT_ID,
      'description',
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(result.description).toBeNull();
    expect(result.diagnostics).toMatchObject([
      {
        code: 'MOLDEA_AGENT_DESCRIPTION_INVALID',
        details: { reason: 'runtime-variable-delimiter' },
        entity: { agentId: AGENT_ID },
      },
      {
        code: 'MOLDEA_AGENT_DESCRIPTION_INVALID',
        details: { reason: 'too-long' },
        entity: { agentId: AGENT_ID },
      },
    ]);
  });

  test('uses the handoff code for an empty Unicode-whitespace effective value', () => {
    const result = validateAgentDescription(
      createAsset('\u0085\u2003\n', 'handoff-description'),
      AGENT_ID,
      'handoff-description',
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(result).toMatchObject({
      description: null,
      diagnostics: [
        {
          code: 'MOLDEA_AGENT_HANDOFF_DESCRIPTION_INVALID',
          details: { reason: 'empty' },
        },
      ],
      valid: false,
    });
  });
});

describe('Core agent instruction validation', () => {
  test.each([
    ['You are the `agent-one` agent.\n'],
    ['\u0085\n###### Purpose\n\u2003\nYou are the `agent-one` agent.\n'],
  ])('accepts a correctly placed exact identity token', (content) => {
    const asset = createAsset(content, 'instruction');
    const result = validateAgentInstruction(asset, AGENT_ID, DEFAULT_CORE_RESOURCE_LIMITS);

    expect(result).toStrictEqual({ diagnostics: [], instruction: asset, valid: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test.each([
    ['You are agent-one.', 'missing'],
    ['You are the `Agent-One` agent.', 'missing'],
    ['Introduction.\nYou are the `agent-one` agent.', 'misplaced'],
    ['####### Purpose\nYou are the `agent-one` agent.', 'misplaced'],
    ['# `agent-one`\nGeneral purpose.', 'misplaced'],
  ])('classifies invalid identity placement as %s -> %s', (content, reason) => {
    const asset = createAsset(content, 'instruction');
    const result = validateAgentInstruction(asset, AGENT_ID, DEFAULT_CORE_RESOURCE_LIMITS);

    expect(result).toMatchObject({
      diagnostics: [
        {
          code: 'MOLDEA_AGENT_IDENTITY_INVALID',
          details: { reason },
          entity: { agentId: AGENT_ID },
        },
      ],
      instruction: asset,
      valid: false,
    });
  });

  test('rejects Unicode-whitespace-only instructions without retaining an asset', () => {
    const result = validateAgentInstruction(
      createAsset('\u0085\u2003\n', 'instruction'),
      AGENT_ID,
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(result).toMatchObject({
      diagnostics: [{ code: 'MOLDEA_AGENT_INSTRUCTION_EMPTY' }],
      instruction: null,
      valid: false,
    });
  });
});
