// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { ICloudflareAgentsSourceAnalysis } from '../contracts/index.js';
import {
  analyzeCloudflareAgentsSource,
  getCloudflareAgentsAiChatRequests,
  getCloudflareAgentsClassDefinition,
  getCloudflareAgentsThinkChannelTools,
  getCloudflareAgentsThinkSessionInstructions,
  getCloudflareAgentsThinkSystemPrompt,
  getCloudflareAgentsThinkTools,
} from './index.js';

const analyze = (source: string): ICloudflareAgentsSourceAnalysis => {
  const result = analyzeCloudflareAgentsSource(
    parseRepositoryPath('/src/agent.ts'),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError('The source fixture must be valid.');
  }

  return result.analysis;
};

describe('Cloudflare Agents source analysis', () => {
  test('recognizes an aliased Think class and its closed instruction and tools methods', () => {
    const analysis = analyze(
      [
        "import { Think as ThinkBase } from '@cloudflare/think';",
        'export class SupportAgent extends ThinkBase {',
        '  getSystemPrompt() { return loadInstruction(); }',
        '  getTools() { return { find_order: findOrderTool }; }',
        '}',
      ].join('\n'),
    );
    const result = getCloudflareAgentsClassDefinition(analysis, 'SupportAgent');

    expect(result.kind).toBe('present-supported');

    if (result.kind === 'present-supported') {
      expect(getCloudflareAgentsThinkSystemPrompt(result.definition).kind).toBe('present');
      expect(getCloudflareAgentsThinkTools(result.definition).kind).toBe('present');
    }
  });

  test('recognizes the closed Think session-builder chain', () => {
    const analysis = analyze(
      [
        "import { Think } from '@cloudflare/think';",
        'export class Agent extends Think {',
        '  configureSession(session) {',
        "    return session.forSession('support').withInstructions(load()).compactAfter(8);",
        '  }',
        '}',
      ].join('\n'),
    );
    const result = getCloudflareAgentsClassDefinition(analysis, 'Agent');

    if (result.kind !== 'present-supported') {
      throw new TypeError('The Think fixture must be supported.');
    }

    expect(getCloudflareAgentsThinkSessionInstructions(result.definition).kind).toBe('present');
  });

  test('treats a malformed compactAfter call as unresolved', () => {
    const analysis = analyze(
      [
        "import { Think } from '@cloudflare/think';",
        'export class Agent extends Think {',
        '  configureSession(session) {',
        '    return session.withInstructions(load()).compactAfter();',
        '  }',
        '}',
      ].join('\n'),
    );
    const result = getCloudflareAgentsClassDefinition(analysis, 'Agent');

    if (result.kind !== 'present-supported') {
      throw new TypeError('The Think fixture must be supported.');
    }

    expect(getCloudflareAgentsThinkSessionInstructions(result.definition).kind).toBe('unresolved');
  });

  test.each([
    [
      'closed tool-free channels',
      "return { web: { kind: 'web', ingress: { transport: 'websocket' } } };",
      'absent',
    ],
    ['a channel tools policy', 'return { web: { tools: (all) => all } };', 'unresolved'],
    ['a dynamic channel definition', 'return { web: webChannel };', 'unresolved'],
  ])('classifies %s as %s', (_description, channelReturn, expectedKind) => {
    const analysis = analyze(
      [
        "import { Think } from '@cloudflare/think';",
        'export class Agent extends Think {',
        `  configureChannels() { ${channelReturn} }`,
        '}',
      ].join('\n'),
    );
    const result = getCloudflareAgentsClassDefinition(analysis, 'Agent');

    if (result.kind !== 'present-supported') {
      throw new TypeError('The Think fixture must be supported.');
    }

    expect(getCloudflareAgentsThinkChannelTools(result.definition).kind).toBe(expectedKind);
  });

  test('recognizes direct AIChatAgent requests and applies instructions precedence', () => {
    const analysis = analyze(
      [
        "import { AIChatAgent } from '@cloudflare/ai-chat';",
        "import { streamText } from 'ai';",
        'export class ChatAgent extends AIChatAgent {',
        '  onChatMessage(onFinish, options?) {',
        '    return streamText({ instructions: load(), system: ignored(), tools, output });',
        '  }',
        '}',
      ].join('\n'),
    );
    const result = getCloudflareAgentsClassDefinition(analysis, 'ChatAgent');

    if (result.kind !== 'present-supported') {
      throw new TypeError('The AIChatAgent fixture must be supported.');
    }

    expect(getCloudflareAgentsAiChatRequests(result.definition, analysis)).toMatchObject([
      { call: 'streamText', instructions: { kind: 'present' } },
    ]);
  });

  test.each([
    [
      'executable field',
      "import { Think } from '@cloudflare/think'; export class Agent extends Think { value = load(); }",
    ],
    [
      'computed method',
      "import { Think } from '@cloudflare/think'; export class Agent extends Think { [name]() {} }",
    ],
    [
      'non-pass-through constructor',
      "import { Think } from '@cloudflare/think'; export class Agent extends Think { constructor(a, b) { super(a, create(b)); } }",
    ],
  ])('suppresses method-derived analysis for an unsupported %s', (_description, source) => {
    expect(getCloudflareAgentsClassDefinition(analyze(source), 'Agent').kind).toBe(
      'present-unsupported',
    );
  });
});
