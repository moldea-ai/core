// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import type { IContentDigest, IIndexedTextAsset } from './contracts.js';
import type { ISourceRange } from './diagnostics.js';
import { countUnicodeScalars } from './format-validation.js';
import type { IRuntimeVariableManifestEntry } from './format.js';
import { validateRuntimePlaceholders } from './runtime-placeholder-validation.js';

const AGENT_ID = 'agent-one';
const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');

const createAsset = (content: string): IIndexedTextAsset => ({
  content,
  digest: 'sha256:test' as IContentDigest,
  path: parseRepositoryPath(`/moldea/agents/${AGENT_ID}/instruction.md`),
  scalarLength: countUnicodeScalars(content),
  utf8ByteLength: new TextEncoder().encode(content).byteLength,
});

const createVariables = (
  variableIds: readonly string[],
): Readonly<Record<string, IRuntimeVariableManifestEntry>> => {
  return Object.fromEntries(
    variableIds.map((variableId) => [variableId, { description: `${variableId} value.` }]),
  );
};

const createRange = (
  startOffset: number,
  endOffset: number,
  startColumn = startOffset + 1,
  endColumn = endOffset + 1,
  line = 1,
): ISourceRange => ({
  end: { column: endColumn, line, offset: endOffset },
  start: { column: startColumn, line, offset: startOffset },
});

describe('Core runtime-placeholder validation', () => {
  test('accepts adjacent and repeated placeholders throughout Markdown content', () => {
    const content = [
      '# Variables',
      '',
      '`{{FIRST}}`',
      '',
      '```text',
      '{{SECOND}}{{FIRST}}',
      '```',
      '',
    ].join('\n');

    expect(
      validateRuntimePlaceholders(
        MANIFEST_PATH,
        AGENT_ID,
        createAsset(content),
        createVariables(['FIRST', 'SECOND']),
        DEFAULT_CORE_RESOURCE_LIMITS,
      ),
    ).toStrictEqual([]);
  });

  test('treats a backslash before an opening delimiter as ordinary text', () => {
    expect(
      validateRuntimePlaceholders(
        MANIFEST_PATH,
        AGENT_ID,
        createAsset('\\{{VALUE}}'),
        createVariables(['VALUE']),
        DEFAULT_CORE_RESOURCE_LIMITS,
      ),
    ).toStrictEqual([]);
  });

  test.each([
    ['{{{', 'invalid-opening-delimiter', 0, 3],
    ['}}}', 'invalid-closing-delimiter', 0, 3],
    ['{{OUTER{{INNER}}', 'nested-opening', 0, 16],
    ['{{FIRST', 'unmatched-opening', 0, 7],
    ['}}', 'unmatched-closing', 0, 2],
    ['{{}}', 'invalid-variable-id', 0, 4],
    ['{{ lower }}', 'invalid-variable-id', 0, 11],
    ['{{LOWER-CASE}}', 'invalid-variable-id', 0, 14],
  ])('classifies %s as %s', (content, reason, startOffset, endOffset) => {
    const diagnostics = validateRuntimePlaceholders(
      MANIFEST_PATH,
      AGENT_ID,
      createAsset(content),
      {},
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(diagnostics).toMatchObject([
      {
        code: 'MOLDEA_VARIABLE_PLACEHOLDER_MALFORMED',
        details: { reason },
        entity: { agentId: AGENT_ID },
        path: `/moldea/agents/${AGENT_ID}/instruction.md`,
        pointer: null,
        range: createRange(startOffset, endOffset),
      },
    ]);
  });

  test('reports an undeclared variable once at its first scalar-aware occurrence', () => {
    const diagnostics = validateRuntimePlaceholders(
      MANIFEST_PATH,
      AGENT_ID,
      createAsset('😀\n{{UNKNOWN}}{{UNKNOWN}}'),
      {},
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(diagnostics).toMatchObject([
      {
        code: 'MOLDEA_VARIABLE_UNDECLARED',
        details: { occurrences: 2 },
        entity: { agentId: AGENT_ID, variableId: 'UNKNOWN' },
        range: {
          end: { column: 12, line: 2, offset: 13 },
          start: { column: 1, line: 2, offset: 2 },
        },
      },
    ]);
  });

  test('does not count malformed candidates as declared-variable usage', () => {
    const diagnostics = validateRuntimePlaceholders(
      MANIFEST_PATH,
      AGENT_ID,
      createAsset('{{unused}}'),
      createVariables(['UNUSED']),
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(diagnostics).toMatchObject([
      {
        code: 'MOLDEA_VARIABLE_PLACEHOLDER_MALFORMED',
        details: { reason: 'invalid-variable-id' },
        path: `/moldea/agents/${AGENT_ID}/instruction.md`,
      },
      {
        code: 'MOLDEA_VARIABLE_UNUSED',
        details: {},
        entity: { agentId: AGENT_ID, variableId: 'UNUSED' },
        path: MANIFEST_PATH,
        pointer: '/agents/agent-one/variables/UNUSED',
        range: null,
      },
    ]);
  });

  test('continues after recoverable malformed syntax', () => {
    const diagnostics = validateRuntimePlaceholders(
      MANIFEST_PATH,
      AGENT_ID,
      createAsset('}} {{bad}} {{KNOWN}} {{UNKNOWN}}'),
      createVariables(['KNOWN']),
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(
      diagnostics.map(({ code, details }) => ({ code, details: { ...details } })),
    ).toStrictEqual([
      {
        code: 'MOLDEA_VARIABLE_PLACEHOLDER_MALFORMED',
        details: { reason: 'unmatched-closing' },
      },
      {
        code: 'MOLDEA_VARIABLE_PLACEHOLDER_MALFORMED',
        details: { reason: 'invalid-variable-id' },
      },
      {
        code: 'MOLDEA_VARIABLE_UNDECLARED',
        details: { occurrences: 1 },
      },
    ]);
  });

  test('handles a large placeholder sequence with bounded output', () => {
    const diagnostics = validateRuntimePlaceholders(
      MANIFEST_PATH,
      AGENT_ID,
      createAsset('{{VALUE}}'.repeat(4_096)),
      createVariables(['VALUE']),
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(diagnostics).toStrictEqual([]);
  });

  test('returns deeply immutable diagnostics', () => {
    const diagnostics = validateRuntimePlaceholders(
      MANIFEST_PATH,
      AGENT_ID,
      createAsset('{{UNKNOWN}}'),
      {},
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.details)).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.entity)).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.range)).toBe(true);
  });
});
