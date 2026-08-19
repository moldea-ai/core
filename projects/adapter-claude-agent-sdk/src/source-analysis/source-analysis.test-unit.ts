// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IClaudeAgentSdkSourceAnalysis } from '../contracts/index.js';
import {
  classifyClaudeAgentSdkAgentAvailability,
  classifyClaudeAgentSdkInstructionLoader,
  getClaudeAgentSdkAgentDefinition,
  getClaudeAgentSdkMcpServerDefinition,
  getClaudeAgentSdkQueryWrapper,
  getClaudeAgentSdkToolDefinition,
  matchesClaudeAgentSdkBarePattern,
} from './index.js';
import { analyzeClaudeAgentSdkSource } from './source-analysis.js';

const analyze = (source: string): IClaudeAgentSdkSourceAnalysis => {
  const result = analyzeClaudeAgentSdkSource(
    parseRepositoryPath('/src/runtime.ts'),
    new TextEncoder().encode(source),
  );

  expect(result.kind).toBe('valid');

  if (result.kind !== 'valid') {
    throw new Error('Expected valid source analysis.');
  }

  return result.analysis;
};

describe('query wrapper analysis', () => {
  test('recognizes direct calls and keeps each options object relationship-local', () => {
    const analysis = analyze(`
      import { query as runQuery } from '@anthropic-ai/claude-agent-sdk';

      export const runtime = async () => {
        await runQuery({ prompt: 'one', options: { tools: ['Agent'] } });
        return runQuery({ prompt: 'two', options: { outputFormat: { type: 'json_schema', schema: {} } } });
      };
    `);
    const result = getClaudeAgentSdkQueryWrapper(analysis, 'runtime');

    expect(result.kind).toBe('present-supported');

    if (result.kind === 'present-supported') {
      expect(result.wrapper.contexts).toHaveLength(2);
      expect(result.wrapper.contexts[0]?.tools.kind).toBe('present');
      expect(result.wrapper.contexts[0]?.outputFormat.kind).toBe('absent');
      expect(result.wrapper.contexts[1]?.tools.kind).toBe('absent');
      expect(result.wrapper.contexts[1]?.outputFormat.kind).toBe('present');
      expect(result.wrapper.hasAmbiguousCandidate).toBe(false);
    }
  });

  test('does not promote nested query calls and records them as ambiguity', () => {
    const analysis = analyze(`
      import { query } from '@anthropic-ai/claude-agent-sdk';

      export const runtime = () => {
        const nested = () => query({ prompt: 'nested' });
        return query({ prompt: 'direct' });
      };
    `);
    const result = getClaudeAgentSdkQueryWrapper(analysis, 'runtime');

    expect(result.kind).toBe('present-supported');

    if (result.kind === 'present-supported') {
      expect(result.wrapper.contexts).toHaveLength(1);
      expect(result.wrapper.hasAmbiguousCandidate).toBe(true);
    }
  });

  test('rejects indirect query inputs and shadowed imports', () => {
    const indirect = analyze(`
      import { query } from '@anthropic-ai/claude-agent-sdk';
      const input = { prompt: 'indirect' };
      export const runtime = () => query(input);
    `);
    const shadowed = analyze(`
      import { query } from '@anthropic-ai/claude-agent-sdk';
      export const runtime = (query: (input: unknown) => unknown) => query({ prompt: 'local' });
    `);

    expect(getClaudeAgentSdkQueryWrapper(indirect, 'runtime').kind).toBe('present-unsupported');
    expect(getClaudeAgentSdkQueryWrapper(shadowed, 'runtime').kind).toBe('present-unsupported');
  });
});

describe('programmatic definitions and SDK helpers', () => {
  test('recognizes supported AgentDefinition fields without requiring a type annotation', () => {
    const analysis = analyze(`
      import { loadPrompt } from './prompt.js';
      export const billing = {
        description: 'Route billing requests.',
        prompt: loadPrompt(),
        tools: ['mcp__support__lookup'],
        observer: 'audit',
      };
    `);
    const result = getClaudeAgentSdkAgentDefinition(analysis, 'billing');

    expect(result.kind).toBe('present-supported');

    if (result.kind === 'present-supported') {
      expect(result.definition.description.kind).toBe('present');
      expect(result.definition.prompt.kind).toBe('present');
      expect(result.definition.tools.kind).toBe('present');
      expect(result.definition.disallowedTools.kind).toBe('absent');
    }
  });

  test('rejects unknown AgentDefinition properties', () => {
    const analysis = analyze(
      `export const billing = { description: 'Billing', futureField: true };`,
    );
    expect(getClaudeAgentSdkAgentDefinition(analysis, 'billing').kind).toBe('present-unsupported');
  });

  test('recognizes the positional tool helper and SDK MCP server configuration', () => {
    const analysis = analyze(`
      import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
      import { InputSchema } from './contracts.js';
      import { lookup } from './lookup.js';

      export const lookupTool = tool('lookup', 'Looks up a record.', InputSchema, lookup);
      export const server = createSdkMcpServer({
        name: 'support',
        tools: [lookupTool],
        instructions: getServerInstructions(),
      });
    `);
    const tool = getClaudeAgentSdkToolDefinition(analysis, 'lookupTool');
    const server = getClaudeAgentSdkMcpServerDefinition(analysis, 'server');

    expect(tool.kind).toBe('present-supported');
    expect(server?.tools.kind).toBe('present');
    expect(server?.version.kind).toBe('absent');
  });
});

describe('instruction and tool availability analysis', () => {
  test('recognizes direct loader calls and the claude_code append preset', () => {
    const analysis = analyze(`
      import { query } from '@anthropic-ai/claude-agent-sdk';
      import { loadPrompt } from './prompt.js';
      export const runtime = async () => query({
        prompt: 'request',
        options: {
          systemPrompt: { type: 'preset', preset: 'claude_code', append: await loadPrompt() },
        },
      });
    `);
    const wrapper = getClaudeAgentSdkQueryWrapper(analysis, 'runtime');

    expect(wrapper.kind).toBe('present-supported');

    if (wrapper.kind === 'present-supported') {
      const relationship = wrapper.wrapper.contexts[0]?.systemPrompt;

      if (relationship !== undefined) {
        expect(
          classifyClaudeAgentSdkInstructionLoader(
            relationship,
            analysis,
            { path: parseRepositoryPath('/src/prompt.ts'), symbol: 'loadPrompt' },
            true,
          ),
        ).toBe(true);
      }
    }
  });

  test('applies exact Agent allow and deny rules', async () => {
    const analysis = analyze(`
      import { query } from '@anthropic-ai/claude-agent-sdk';
      export const runtime = () => query({
        prompt: 'request',
        options: { tools: ['Agent'], disallowedTools: ['Task'] },
      });
    `);
    const wrapper = getClaudeAgentSdkQueryWrapper(analysis, 'runtime');

    expect(wrapper.kind).toBe('present-supported');

    if (wrapper.kind === 'present-supported') {
      const queryContext = wrapper.wrapper.contexts[0];

      if (queryContext !== undefined) {
        const availability = await classifyClaudeAgentSdkAgentAvailability(
          analysis,
          queryContext.tools,
          queryContext.disallowedTools,
          queryContext.agentSelection,
          queryContext.toolAliases,
          new Set(),
          (_source, expression) => {
            const candidate = expression;
            return Promise.resolve(
              ts.isStringLiteral(candidate)
                ? { expression: candidate, kind: 'supported', value: candidate.text }
                : { kind: 'unsupported' },
            );
          },
        );

        expect(availability).toBe('unresolved');
      }
    }
  });

  test.each([
    ['Agent', 'Agent', true],
    ['*', 'Agent', true],
    ['mcp__orders__*', 'mcp__orders__find_order', true],
    ['mcp__orders__find_*', 'mcp__orders__find_order', true],
    ['mcp__orders__find', 'mcp__orders__find_order', false],
    ['A*B', 'AB', true],
    ['A*B', 'A😀B', true],
  ])('matchesClaudeAgentSdkBarePattern(%s, %s) -> %s', (pattern, name, expected) => {
    expect(matchesClaudeAgentSdkBarePattern(pattern, name)).toBe(expected);
  });
});
