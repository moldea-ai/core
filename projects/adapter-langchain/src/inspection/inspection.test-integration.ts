// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createCore } from '@moldea.ai/core';
import type { IRepositoryReader } from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { langChainAdapter } from '../adapter/index.js';
import { LANGCHAIN_ADAPTER_DIAGNOSTICS } from '../diagnostics/index.js';

interface ILangChainFixture {
  readonly entries: readonly {
    readonly path: string;
    readonly text: string;
    readonly type: 'file';
  }[];
  readonly manifest: string;
}

type IFixtureReplacement = string | Uint8Array;

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-langchain/cases.json', import.meta.url),
    'utf8',
  ),
) as ILangChainFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-langchain/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/adapter-langchain/diagnostics.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly { readonly code: string; readonly message: string }[];

const createEntries = (
  replacements: Readonly<Record<string, IFixtureReplacement>> = {},
): readonly IMemoryRepositoryEntry[] => {
  const fixturePaths = new Set(fixture.entries.map(({ path }) => path));

  return [
    {
      content: replacements['/moldea/moldea.yaml'] ?? fixture.manifest,
      path: '/moldea/moldea.yaml',
      type: 'file',
    },
    ...fixture.entries.map((entry): IMemoryRepositoryEntry => ({
      content: replacements[entry.path] ?? entry.text,
      path: entry.path,
      type: 'file',
    })),
    ...Object.entries(replacements)
      .filter(([path]) => path !== '/moldea/moldea.yaml' && !fixturePaths.has(path))
      .map(([path, content]): IMemoryRepositoryEntry => ({ content, path, type: 'file' })),
  ];
};

const inspect = async (replacements: Readonly<Record<string, IFixtureReplacement>> = {}) =>
  createCore({ adapters: [langChainAdapter] }).inspectProject({
    repository: createMemoryRepositoryReader(createEntries(replacements)),
  });

const getFixtureText = (path: string): string => {
  const text = fixture.entries.find((entry) => entry.path === path)?.text;

  if (text === undefined) {
    throw new TypeError(`The ${path} fixture is required.`);
  }

  return text;
};

describe('langChainAdapter Core integration', () => {
  test('keeps the complete stable diagnostic catalog synchronized', () => {
    expect(
      Object.entries(LANGCHAIN_ADAPTER_DIAGNOSTICS)
        .map(([code, message]) => ({ code, message }))
        .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)),
    ).toStrictEqual(expectedDiagnostics);
  });

  test('emits complete normalized evidence for the verified createAgent target', async () => {
    const result = await inspect();

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(result.evidence).toEqual(expectedEvidence);
  });

  test.each([
    ['absent', '{}'],
    ['supported', '{"dependencies":{"@langchain/core":"~1.2.8"}}'],
    ['ambiguous', '{"dependencies":{"@langchain/core":"workspace:*"}}'],
    ['unsupported', '{"dependencies":{"@langchain/core":"1.1.0"}}'],
  ] as const)(
    'emits no runtime-package evidence when the primary is absent and the companion is %s',
    async (_companionState, packageManifest) => {
      const result = await inspect({ '/package.json': packageManifest });

      expect(result.diagnostics).toStrictEqual([]);
      expect(result.evidence.some(({ kind }) => kind === 'runtime-package')).toBe(false);
    },
  );

  test('is deterministic for reversed entries and concurrent inspections', async () => {
    const reversed = await createCore({ adapters: [langChainAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader([...createEntries()].reverse()),
    });
    const concurrent = await Promise.all([inspect(), inspect(), inspect(), inspect()]);

    expect(reversed.evidence).toEqual(expectedEvidence);
    expect(concurrent.map(({ evidence }) => evidence)).toEqual([
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
      expectedEvidence,
    ]);
  });

  test.each([
    ['LANGCHAIN_PACKAGE_MANIFEST_INVALID', '/package.json', '{'],
    [
      'LANGCHAIN_VERSION_UNSUPPORTED',
      '/package.json',
      '{"dependencies":{"@langchain/core":"~1.2.8","langchain":"1.4.0"}}',
    ],
    ['LANGCHAIN_SOURCE_TEXT_INVALID', '/src/agent.ts', Uint8Array.from([0xff])],
    ['LANGCHAIN_SOURCE_SYNTAX_INVALID', '/src/agent.ts', 'export const supportAgent = (;'],
    [
      'LANGCHAIN_RUNTIME_AGENT_SYMBOL_NOT_FOUND',
      '/src/agent.ts',
      "import { createAgent } from 'langchain'; export const otherAgent = createAgent({ model: 'x' });",
    ],
    [
      'LANGCHAIN_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      '/src/instructions.ts',
      "export const otherLoader = () => 'support';\n",
    ],
    [
      'LANGCHAIN_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('SupportOutputSchema', 'OtherOutputSchema'),
    ],
    [
      'LANGCHAIN_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      '/src/implementations.ts',
      'export const otherImplementation = () => undefined;\n',
    ],
    [
      'LANGCHAIN_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
      '/src/tools.ts',
      "import { tool } from 'langchain'; export const otherTool = tool(() => undefined, { name: 'other' });\n",
    ],
    [
      'LANGCHAIN_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      '/src/contracts.ts',
      getFixtureText('/src/contracts.ts').replace('FindOrderInputSchema', 'OtherInputSchema'),
    ],
  ] as const)('emits %s for the proved invalid state', async (expectedCode, path, replacement) => {
    const result = await inspect({ [path]: replacement });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
  });

  test('emits independent closed wiring and name diagnostics', async () => {
    const agent = getFixtureText('/src/agent.ts');
    const tool = getFixtureText('/src/tools.ts');
    const replacements = [
      [
        'LANGCHAIN_INSTRUCTION_LOADER_NOT_WIRED',
        { '/src/agent.ts': agent.replace('loadSupportInstruction()', "'static'") },
      ],
      [
        'LANGCHAIN_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
        {
          '/src/agent.ts': agent
            .replace('schema: SupportOutputSchema', 'schema: OtherOutputSchema')
            .replace(
              "import { SupportOutputSchema } from './contracts.js';",
              "import { OtherOutputSchema, SupportOutputSchema } from './contracts.js';",
            ),
          '/src/contracts.ts': `${getFixtureText('/src/contracts.ts')}export const OtherOutputSchema = {};\n`,
        },
      ],
      [
        'LANGCHAIN_TOOL_IMPLEMENTATION_NOT_WIRED',
        { '/src/tools.ts': tool.replace('tool(findOrder,', 'tool(() => undefined,') },
      ],
      [
        'LANGCHAIN_TOOL_INPUT_SCHEMA_NOT_WIRED',
        { '/src/tools.ts': tool.replace('schema: FindOrderInputSchema', 'schema: {}') },
      ],
      [
        'LANGCHAIN_TOOL_NAME_MISMATCH',
        { '/src/tools.ts': tool.replace("name: 'find_order'", "name: 'lookup_order'") },
      ],
      [
        'LANGCHAIN_TOOL_REGISTRATION_NOT_WIRED',
        { '/src/agent.ts': agent.replace('const TOOLS = [findOrderTool];', 'const TOOLS = [];') },
      ],
    ] as const;

    for (const [expectedCode, replacement] of replacements) {
      const result = await inspect(replacement);
      expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
    }
  });

  test('suppresses middleware-sensitive conclusions when middleware is active', async () => {
    const result = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
        'const MIDDLEWARE = [];',
        'const MIDDLEWARE = [{}];',
      ),
    });
    const middlewareSensitiveKinds = new Set(['instruction-loader', 'tool-registration']);

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.filter(
        ({ kind, details }) =>
          middlewareSensitiveKinds.has(kind) || details['schemaRole'] === 'agent-output',
      ),
    ).toStrictEqual([]);
    expect(result.evidence.some(({ kind }) => kind === 'agent-definition')).toBe(true);
  });

  test('leaves developer-authored response-format arrays unresolved', async () => {
    const result = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
        'providerStrategy({ schema: SupportOutputSchema, strict: true })',
        '[SupportOutputSchema, {}]',
      ),
    });

    expect(result.diagnostics.map(({ code }) => code)).not.toContain(
      'LANGCHAIN_AGENT_OUTPUT_SCHEMA_NOT_WIRED',
    );
    expect(result.evidence.some(({ details }) => details['schemaRole'] === 'agent-output')).toBe(
      false,
    );
  });

  test('does not inspect declaration files as runtime TypeScript sources', async () => {
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace('/src/agent.ts', '/src/agent.d.ts'),
      '/src/agent.d.ts': getFixtureText('/src/agent.ts'),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.filter(
        ({ agentId, kind }) =>
          agentId === 'support' && (kind === 'language' || kind === 'agent-definition'),
      ),
    ).toStrictEqual([]);
  });

  test.each(['/src/agent.tsx', '/src/agent.mts'] as const)(
    'inspects supported runtime source %s',
    async (runtimePath) => {
      const result = await inspect({
        '/moldea/moldea.yaml': fixture.manifest.replace('/src/agent.ts', runtimePath),
        [runtimePath]: getFixtureText('/src/agent.ts'),
      });

      expect(result.diagnostics).toStrictEqual([]);
      expect(
        result.evidence.some(
          ({ kind, references }) =>
            kind === 'agent-definition' && references.some(({ path }) => path === runtimePath),
        ),
      ).toBe(true);
    },
  );

  test('recognizes a tool declared beside its imported agent collection', async () => {
    const result = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts')
        .replace('const TOOLS = [findOrderTool];', "import { TOOLS } from './tools.js';")
        .replace("import { findOrderTool } from './tools.js';\n", ''),
      '/src/tools.ts': `${getFixtureText('/src/tools.ts')}export const TOOLS = [findOrderTool];\n`,
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ capabilityId, kind }) => capabilityId === 'find-order' && kind === 'tool-registration',
      ),
    ).toBe(true);
  });

  test('keeps tool relationships unresolved when an unrelated array alias escapes', async () => {
    const result = await inspect({
      '/src/tools.ts': `${getFixtureText('/src/tools.ts')}const escaped = [findOrderTool]; consume(escaped);\n`,
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.filter(({ capabilityId }) => capabilityId === 'find-order'),
    ).toStrictEqual([]);
  });

  test('does not probe an unrelated imported tool collection', async () => {
    const source = createMemoryRepositoryReader(
      createEntries({
        '/moldea/agents/observer/description.md': 'Observes customer support.\n',
        '/moldea/agents/observer/instruction.md': 'You are the `observer` agent.\n',
        '/moldea/moldea.yaml': `${fixture.manifest}  observer:\n    runtime:\n      id: langchain\n    bindings:\n      runtimeAgent:\n        path: /src/observer.ts\n        symbol: observerAgent\n`,
        '/src/observer.ts':
          "import { createAgent } from 'langchain';\nimport { TOOLS } from './unrelated-tools.js';\nexport const observerAgent = createAgent({ model: 'provider:model', tools: TOOLS });\n",
      }),
    );
    const probedPaths: string[] = [];
    const repository: IRepositoryReader = {
      getEntry: (path, options) => {
        probedPaths.push(path);
        return source.getEntry(path, options);
      },
      listEntries: (options) => source.listEntries(options),
      readFile: (path, options) => source.readFile(path, options),
    };
    const result = await createCore({ adapters: [langChainAdapter] }).inspectProject({
      repository,
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ capabilityId, kind }) => capabilityId === 'find-order' && kind === 'tool-registration',
      ),
    ).toBe(true);
    expect(probedPaths).not.toContain('/src/unrelated-tools.ts');
  });

  test.each(['langchain', 'langchain/tools'] as const)(
    'recognizes the normal function tool from %s',
    async (helperSource) => {
      const result = await inspect({
        '/src/tools.ts': getFixtureText('/src/tools.ts').replace(
          "'@langchain/core/tools'",
          `'${helperSource}'`,
        ),
      });

      expect(result.diagnostics).toStrictEqual([]);
      expect(
        result.evidence.some(
          ({ details, kind }) =>
            kind === 'tool-registration' && details['helperSource'] === helperSource,
        ),
      ).toBe(true);
    },
  );

  test.each([
    ['omitted', 'const MIDDLEWARE = [];', 'middleware: MIDDLEWARE,', ''],
    ['inline empty', 'const MIDDLEWARE = [];', 'middleware: MIDDLEWARE', 'middleware: []'],
    [
      'imported empty',
      'const MIDDLEWARE = [];',
      'middleware: MIDDLEWARE',
      'middleware: IMPORTED_MIDDLEWARE',
    ],
  ] as const)(
    'keeps relationships active with %s middleware',
    async (description, declaration, relationship, replacement) => {
      const isImported = description === 'imported empty';
      const result = await inspect({
        '/src/agent.ts': getFixtureText('/src/agent.ts')
          .replace(
            declaration,
            isImported
              ? "import { MIDDLEWARE as IMPORTED_MIDDLEWARE } from './middleware.js';"
              : declaration,
          )
          .replace(relationship, replacement),
        ...(isImported ? { '/src/middleware.ts': 'export const MIDDLEWARE = [];\n' } : {}),
      });

      expect(result.diagnostics).toStrictEqual([]);
      expect(result.evidence.some(({ kind }) => kind === 'instruction-loader')).toBe(true);
      expect(result.evidence.some(({ kind }) => kind === 'tool-registration')).toBe(true);
      expect(result.evidence.some(({ details }) => details['schemaRole'] === 'agent-output')).toBe(
        true,
      );
    },
  );

  test('suppresses relationship conclusions for dynamic middleware', async () => {
    const result = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
        'middleware: MIDDLEWARE',
        'middleware: getMiddleware()',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.some(({ kind }) => kind === 'agent-definition')).toBe(true);
    expect(
      result.evidence.some(
        ({ kind, details }) =>
          kind === 'instruction-loader' ||
          kind === 'tool-registration' ||
          details['schemaRole'] === 'agent-output',
      ),
    ).toBe(false);
  });

  test.each([
    [
      'direct loader call',
      'new SystemMessage(loadSupportInstruction())',
      'loadSupportInstruction()',
    ],
    [
      'awaited loader call',
      'new SystemMessage(loadSupportInstruction())',
      'await loadSupportInstruction()',
    ],
    [
      'aliased core SystemMessage',
      "import { createAgent, providerStrategy, SystemMessage } from 'langchain';",
      "import { createAgent, providerStrategy } from 'langchain';\nimport { SystemMessage as CoreSystemMessage } from '@langchain/core/messages';",
    ],
  ] as const)('recognizes the %s instruction form', async (description, source, replacement) => {
    const agentSource = getFixtureText('/src/agent.ts')
      .replace(source, replacement)
      .replace(
        description === 'aliased core SystemMessage'
          ? 'new SystemMessage(loadSupportInstruction())'
          : 'never matches',
        'new CoreSystemMessage(loadSupportInstruction())',
      );
    const result = await inspect({ '/src/agent.ts': agentSource });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.some(({ kind }) => kind === 'instruction-loader')).toBe(true);
  });

  test.each([
    [
      'direct schema',
      'providerStrategy({ schema: SupportOutputSchema, strict: true })',
      'SupportOutputSchema',
      'direct',
    ],
    [
      'tool strategy',
      'providerStrategy({ schema: SupportOutputSchema, strict: true })',
      'toolStrategy(SupportOutputSchema)',
      'tool-strategy',
    ],
    [
      'tool strategy with options',
      'providerStrategy({ schema: SupportOutputSchema, strict: true })',
      'toolStrategy(SupportOutputSchema, {})',
      'tool-strategy',
    ],
    [
      'direct provider strategy',
      'providerStrategy({ schema: SupportOutputSchema, strict: true })',
      'providerStrategy(SupportOutputSchema)',
      'provider-strategy',
    ],
  ] as const)(
    'recognizes the %s response format',
    async (_description, source, replacement, expectedStrategy) => {
      const result = await inspect({
        '/src/agent.ts': getFixtureText('/src/agent.ts')
          .replace(
            "import { createAgent, providerStrategy, SystemMessage } from 'langchain';",
            "import { createAgent, providerStrategy, SystemMessage, toolStrategy } from 'langchain';",
          )
          .replace(source, replacement),
      });

      expect(result.diagnostics).toStrictEqual([]);
      expect(
        result.evidence.some(
          ({ details, kind }) =>
            kind === 'schema' &&
            details['schemaRole'] === 'agent-output' &&
            details['schemaStrategy'] === expectedStrategy,
        ),
      ).toBe(true);
    },
  );

  test('retains agent identity but suppresses relationship evidence after invocation-path replacement', async () => {
    const result = await inspect({
      '/src/agent.ts': `${getFixtureText('/src/agent.ts')}supportAgent.invoke = replacement;\n`,
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.some(({ kind }) => kind === 'language')).toBe(true);
    expect(result.evidence.some(({ kind }) => kind === 'agent-definition')).toBe(true);
    expect(
      result.evidence.some(
        ({ kind, details }) =>
          kind === 'instruction-loader' ||
          kind === 'tool-registration' ||
          details['schemaRole'] === 'agent-output',
      ),
    ).toBe(false);
  });

  test('preserves independent tool evidence after same-module agent invocation mutation', async () => {
    const agentSource = getFixtureText('/src/agent.ts')
      .replace(
        "import { SupportOutputSchema } from './contracts.js';",
        "import { tool } from '@langchain/core/tools';\nimport { FindOrderInputSchema, SupportOutputSchema } from './contracts.js';\nimport { findOrder } from './implementations.js';",
      )
      .replace(
        "import { findOrderTool } from './tools.js';",
        "export const findOrderTool = tool(findOrder, { name: 'find_order', description: 'Finds an order.', schema: FindOrderInputSchema });",
      );
    const result = await inspect({
      '/moldea/moldea.yaml': fixture.manifest.replace(
        'registration:\n          path: /src/tools.ts',
        'registration:\n          path: /src/agent.ts',
      ),
      '/src/agent.ts': `${agentSource}supportAgent.invoke = replacement;\n`,
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ capabilityId, details }) =>
          capabilityId === 'find-order' && details['schemaRole'] === 'tool-input',
      ),
    ).toBe(true);
    expect(
      result.evidence.some(
        ({ capabilityId, kind }) => capabilityId === 'find-order' && kind === 'tool-registration',
      ),
    ).toBe(false);
  });

  test('retains agent identity but suppresses relationship conclusions for prototype setters', async () => {
    const result = await inspect({
      '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
        'createAgent({ model:',
        'createAgent({ __proto__: {}, model:',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence.some(({ kind }) => kind === 'agent-definition')).toBe(true);
    expect(
      result.evidence.some(
        ({ kind, details }) =>
          kind === 'instruction-loader' ||
          kind === 'tool-registration' ||
          details['schemaRole'] === 'agent-output',
      ),
    ).toBe(false);
  });

  test('leaves normal tools with dynamic descriptions unresolved', async () => {
    const result = await inspect({
      '/src/tools.ts': getFixtureText('/src/tools.ts').replace(
        "description: 'Finds an order.'",
        'description: getDescription()',
      ),
    });

    expect(result.diagnostics).toStrictEqual([]);
    expect(
      result.evidence.some(
        ({ capabilityId, kind }) => capabilityId === 'find-order' && kind === 'tool-registration',
      ),
    ).toBe(false);
    expect(
      result.evidence.some(
        ({ capabilityId, details }) =>
          capabilityId === 'find-order' && details['schemaRole'] === 'tool-input',
      ),
    ).toBe(false);
  });

  test.each([
    ['name', 'findOrderTool.name = replacement;', false, true, false],
    ['schema', 'findOrderTool.schema = replacement;', true, false, true],
    ['func', 'findOrderTool.func = replacement;', true, true, false],
    ['invoke', 'findOrderTool.invoke = replacement;', true, true, false],
    ['description metadata', 'findOrderTool.description = replacement;', true, true, true],
    ['unrelated metadata', 'findOrderTool.metadata = replacement;', true, true, true],
  ] as const)(
    'keeps a returned-tool %s mutation relationship-local',
    async (
      _member,
      mutation,
      expectsRegistration,
      expectsSchema,
      expectsImplementationReference,
    ) => {
      const result = await inspect({
        '/src/tools.ts': `${getFixtureText('/src/tools.ts')}${mutation}\n`,
      });
      const registration = result.evidence.find(
        ({ capabilityId, kind }) => capabilityId === 'find-order' && kind === 'tool-registration',
      );
      const schema = result.evidence.find(
        ({ capabilityId, details }) =>
          capabilityId === 'find-order' && details['schemaRole'] === 'tool-input',
      );

      expect(result.diagnostics).toStrictEqual([]);
      expect(registration !== undefined).toBe(expectsRegistration);
      expect(schema !== undefined).toBe(expectsSchema);

      if (registration !== undefined) {
        expect(registration.references.some(({ path }) => path === '/src/implementations.ts')).toBe(
          expectsImplementationReference,
        );
      }
    },
  );

  test.each([
    ['LANGCHAIN_SOURCE_TEXT_INVALID', Uint8Array.from([0xff])],
    ['LANGCHAIN_SOURCE_SYNTAX_INVALID', 'export const MIDDLEWARE = [;'],
  ] as const)(
    'reports %s from an imported middleware collection',
    async (expectedCode, middlewareSource) => {
      const result = await inspect({
        '/src/agent.ts': getFixtureText('/src/agent.ts').replace(
          'const MIDDLEWARE = [];',
          "import { MIDDLEWARE } from './middleware.js';",
        ),
        '/src/middleware.ts': middlewareSource,
      });

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: expectedCode, path: '/src/middleware.ts' }),
      );
      expect(result.evidence.some(({ kind }) => kind === 'agent-definition')).toBe(true);
      expect(result.evidence.some(({ kind }) => kind === 'tool-registration')).toBe(false);
    },
  );

  test.each([
    ['LANGCHAIN_SOURCE_TEXT_INVALID', Uint8Array.from([0xff])],
    ['LANGCHAIN_SOURCE_SYNTAX_INVALID', 'export const TOOLS = [;'],
  ] as const)(
    'reports %s from an imported tool collection',
    async (expectedCode, collectionSource) => {
      const result = await inspect({
        '/src/agent.ts': getFixtureText('/src/agent.ts')
          .replace(
            'const TOOLS = [findOrderTool];',
            "import { TOOLS } from './tool-collection.js';",
          )
          .replace("import { findOrderTool } from './tools.js';\n", ''),
        '/src/tool-collection.ts': collectionSource,
      });

      expect(result.valid).toBe(false);
      expect(
        result.diagnostics.some(
          ({ code, entity, path }) =>
            code === expectedCode &&
            entity?.capabilityId === 'find-order' &&
            path === '/src/tool-collection.ts',
        ),
      ).toBe(true);
      expect(result.evidence.some(({ kind }) => kind === 'tool-registration')).toBe(false);
    },
  );

  test.each([
    ['LANGCHAIN_SOURCE_TEXT_INVALID', Uint8Array.from([0xff])],
    ['LANGCHAIN_SOURCE_SYNTAX_INVALID', "export const TOOL_DESCRIPTION = ';"],
  ] as const)(
    'reports %s from an imported tool description',
    async (expectedCode, metadataSource) => {
      const result = await inspect({
        '/src/tool-metadata.ts': metadataSource,
        '/src/tools.ts': getFixtureText('/src/tools.ts')
          .replace(
            "import { tool } from '@langchain/core/tools';",
            "import { tool } from '@langchain/core/tools';\nimport { TOOL_DESCRIPTION } from './tool-metadata.js';",
          )
          .replace("description: 'Finds an order.'", 'description: TOOL_DESCRIPTION'),
      });

      expect(result.valid).toBe(false);
      expect(
        result.diagnostics.some(
          ({ code, entity, path }) =>
            code === expectedCode &&
            entity?.capabilityId === 'find-order' &&
            path === '/src/tool-metadata.ts',
        ),
      ).toBe(true);
      expect(result.evidence.some(({ kind }) => kind === 'tool-registration')).toBe(false);
    },
  );

  test('returns no runtime diagnostics for a dedicated repository without bindings', async () => {
    const result = await createCore({ adapters: [langChainAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader([
        {
          content: 'version: 1\nagents:\n  external:\n    runtime:\n      id: langchain\n',
          path: '/moldea/moldea.yaml',
          type: 'file',
        },
        { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
        {
          content: 'External runtime agent.\n',
          path: '/moldea/agents/external/description.md',
          type: 'file',
        },
        {
          content: 'You are the `external` agent.\n',
          path: '/moldea/agents/external/instruction.md',
          type: 'file',
        },
      ]),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.evidence).toStrictEqual([]);
  });

  test('propagates cancellation without returning partial success', async () => {
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));

    await expect(
      createCore({ adapters: [langChainAdapter] }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
