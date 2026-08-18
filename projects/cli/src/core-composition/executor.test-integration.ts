// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { parseRepositoryPath } from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import {
  createMoldeaCliCoreInspectionExecutor,
  executeMoldeaCliCoreInspection,
} from './executor.js';

const RESOURCE_LIMITS = Object.freeze({
  maxDiagnostics: 32,
  maxEntries: 128,
  maxEvidence: 16,
  maxFileBytes: 4096,
  maxManifestBytes: 2048,
  maxTotalBytes: 8192,
});

/** Creates one complete agent fixture for a runtime adapter. */
const createAgentEntries = (agentId: string): readonly IMemoryRepositoryEntry[] => [
  {
    content: `${agentId} agent.\n`,
    path: `/moldea/agents/${agentId}/description.md`,
    type: 'file' as const,
  },
  {
    content: `You are the \`${agentId}\` agent.\n`,
    path: `/moldea/agents/${agentId}/instruction.md`,
    type: 'file' as const,
  },
];

describe('CLI Core composition with the memory repository reader', () => {
  test('inspects a valid custom-agent project without a package-backed adapter', async () => {
    const reader = createMemoryRepositoryReader([
      {
        content: 'version: 1\nagents:\n  alpha:\n    runtime:\n      id: custom\n',
        path: '/moldea/moldea.yaml',
        type: 'file',
      },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      {
        content: 'Alpha agent.\n',
        path: '/moldea/agents/alpha/description.md',
        type: 'file',
      },
      {
        content: 'You are the `alpha` agent.\n',
        path: '/moldea/agents/alpha/instruction.md',
        type: 'file',
      },
    ]);

    const result = await executeMoldeaCliCoreInspection({
      repository: reader,
      resourceLimits: RESOURCE_LIMITS,
    });

    expect(result).toMatchObject({
      diagnostics: [],
      evidence: [],
      formatVersion: 1,
      project: {
        agents: [{ id: 'alpha' }],
      },
      valid: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test('runs the active OpenAI adapter through CLI composition', async () => {
    const reader = createMemoryRepositoryReader([
      {
        content: [
          'version: 1',
          'agents:',
          '  alpha:',
          '    runtime:',
          '      id: openai',
          '    bindings:',
          '      runtimeAgent:',
          '        path: /src/agent.ts',
          '        symbol: alphaAgent',
          '',
        ].join('\n'),
        path: '/moldea/moldea.yaml',
        type: 'file',
      },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      ...createAgentEntries('alpha'),
      {
        content: '{"dependencies":{"openai":"^7.4.0"}}\n',
        path: '/package.json',
        type: 'file',
      },
      {
        content: [
          "import OpenAI from 'openai';",
          'const client = new OpenAI();',
          "export const alphaAgent = () => client.responses.create({ input: 'hello' });",
          '',
        ].join('\n'),
        path: '/src/agent.ts',
        type: 'file',
      },
    ]);

    const result = await executeMoldeaCliCoreInspection({
      repository: reader,
      resourceLimits: RESOURCE_LIMITS,
    });

    expect(result).toMatchObject({
      diagnostics: [],
      evidence: [
        { agentId: 'alpha', kind: 'language', source: 'openai' },
        { kind: 'runtime-package', runtimeName: 'openai', source: 'openai' },
        { agentId: 'alpha', kind: 'runtime-pattern', source: 'openai' },
      ],
      project: { agents: [{ id: 'alpha' }] },
      valid: true,
    });
  });

  test('runs the active Google Gen AI adapter through CLI composition', async () => {
    const reader = createMemoryRepositoryReader([
      {
        content: [
          'version: 1',
          'agents:',
          '  alpha:',
          '    runtime:',
          '      id: google-genai',
          '    bindings:',
          '      runtimeAgent:',
          '        path: /src/agent.ts',
          '        symbol: alphaAgent',
          '',
        ].join('\n'),
        path: '/moldea/moldea.yaml',
        type: 'file',
      },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      ...createAgentEntries('alpha'),
      {
        content: '{"dependencies":{"@google/genai":"2.17.1"}}\n',
        path: '/package.json',
        type: 'file',
      },
      {
        content: [
          "import { GoogleGenAI } from '@google/genai';",
          'const client = new GoogleGenAI();',
          "export const alphaAgent = () => client.models.generateContent({ contents: 'hello' });",
          '',
        ].join('\n'),
        path: '/src/agent.ts',
        type: 'file',
      },
    ]);

    const result = await executeMoldeaCliCoreInspection({
      repository: reader,
      resourceLimits: RESOURCE_LIMITS,
    });

    expect(result).toMatchObject({
      diagnostics: [],
      evidence: [
        { agentId: 'alpha', kind: 'language', source: 'google-genai' },
        { kind: 'runtime-package', runtimeName: '@google/genai', source: 'google-genai' },
        { agentId: 'alpha', kind: 'runtime-pattern', source: 'google-genai' },
      ],
      project: { agents: [{ id: 'alpha' }] },
      valid: true,
    });
  });

  test('normalizes injected adapter execution while universal failure remains all-or-nothing', async () => {
    const calls: string[] = [];
    const projectPath = parseRepositoryPath('/moldea/project.md');
    const createAdapter = (id: string): IRuntimeAdapter => ({
      id,
      inspect: (context) => {
        calls.push(id);
        const agent = context.agents[0];

        if (agent === undefined) {
          throw new Error('The adapter fixture requires one scoped agent.');
        }

        const agentId = agent.id;

        return Promise.resolve({
          diagnostics:
            id === 'openai'
              ? [
                  {
                    code: 'OPENAI_TEST_DIAGNOSTIC',
                    details: {},
                    entity: { adapterId: id, agentId },
                    message: 'The OpenAI adapter fixture reported a diagnostic.',
                    path: null,
                    pointer: null,
                    range: null,
                    source: id,
                  },
                ]
              : [],
          evidence:
            id === 'anthropic'
              ? [
                  {
                    agentId,
                    capabilityId: null,
                    capabilityKind: null,
                    details: { observed: true },
                    kind: 'agent-definition',
                    references: [{ path: projectPath }],
                    runtimeName: 'AnthropicFixture',
                    source: id,
                  },
                ]
              : [],
        });
      },
      supportedRepositoryFormatVersions: [1],
    });
    const executeInspection = createMoldeaCliCoreInspectionExecutor(createCore, [
      createAdapter('openai'),
      createAdapter('anthropic'),
    ]);
    const entries = [
      {
        content: [
          'version: 1',
          'agents:',
          '  alpha:',
          '    runtime:',
          '      id: anthropic',
          '  zeta:',
          '    runtime:',
          '      id: openai',
          '',
        ].join('\n'),
        path: '/moldea/moldea.yaml',
        type: 'file' as const,
      },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' as const },
      ...createAgentEntries('alpha'),
      ...createAgentEntries('zeta'),
    ];

    const result = await executeInspection({
      repository: createMemoryRepositoryReader(entries),
      resourceLimits: RESOURCE_LIMITS,
    });

    expect(calls).toStrictEqual(['anthropic', 'openai']);
    expect(result).toMatchObject({
      diagnostics: [{ code: 'OPENAI_TEST_DIAGNOSTIC', source: 'openai' }],
      evidence: [{ kind: 'agent-definition', source: 'anthropic' }],
      project: null,
      valid: false,
    });

    calls.length = 0;
    const universalFailure = await executeInspection({
      repository: createMemoryRepositoryReader(
        entries.filter(({ path }) => path !== '/moldea/project.md'),
      ),
      resourceLimits: RESOURCE_LIMITS,
    });

    expect(universalFailure).toMatchObject({ evidence: [], project: null, valid: false });
    expect(calls).toStrictEqual([]);
  });
});
