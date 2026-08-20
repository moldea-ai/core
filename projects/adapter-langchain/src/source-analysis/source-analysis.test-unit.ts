// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { analyzeLangChainSource } from './source-analysis.js';
import { getLangChainAgentDefinition } from './agent-definitions.js';
import { getInlineLangChainFunctionTool, getLangChainFunctionTool } from './function-tools.js';

const analyze = (source: string) => {
  const result = analyzeLangChainSource(
    parseRepositoryPath('/src/runtime.ts'),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError(`Expected valid source, received ${result.kind}.`);
  }

  return result.analysis;
};

describe('LangChain source analysis', () => {
  test('recognizes an aliased package-root createAgent definition', () => {
    const analysis = analyze(
      "import { createAgent as makeAgent } from 'langchain'; export const agent = makeAgent({ model: 'openai:gpt-4o', middleware: [] });",
    );

    expect(getLangChainAgentDefinition(analysis, 'agent')).toMatchObject({
      definition: { middleware: { kind: 'present' }, name: { kind: 'absent' } },
      kind: 'present-supported',
    });
  });

  test('keeps direct invocations safe and rejects invocation-path replacement', () => {
    const directInvocation = analyze(
      "import { createAgent } from 'langchain'; export const agent = createAgent({ model: 'x' }); agent.invoke({});",
    );
    const replacedInvocation = analyze(
      "import { createAgent } from 'langchain'; export const agent = createAgent({ model: 'x', tools: [] }); agent.invoke = replacement;",
    );

    expect(getLangChainAgentDefinition(directInvocation, 'agent').kind).toBe('present-supported');
    expect(getLangChainAgentDefinition(replacedInvocation, 'agent')).toMatchObject({
      definition: {
        configuredTools: { kind: 'present' },
        middleware: { kind: 'unresolved' },
        responseFormat: { kind: 'unresolved' },
        systemPrompt: { kind: 'unresolved' },
        tools: { kind: 'unresolved' },
      },
      kind: 'present-supported',
    });
  });

  test('resolves spread relationships only when later own properties replace them', () => {
    const before = analyze(
      "import { createAgent } from 'langchain'; const config = {}; export const agent = createAgent({ ...config, model: 'x', tools: [] });",
    );
    const after = analyze(
      "import { createAgent } from 'langchain'; const config = {}; export const agent = createAgent({ model: 'x', tools: [], ...config });",
    );

    expect(getLangChainAgentDefinition(before, 'agent')).toMatchObject({
      definition: { tools: { kind: 'present' } },
      kind: 'present-supported',
    });
    expect(getLangChainAgentDefinition(after, 'agent').kind).toBe('present-unsupported');
  });

  test('retains the agent identity but leaves all relationships unresolved for prototype setters', () => {
    const analysis = analyze(
      "import { createAgent } from 'langchain'; export const agent = createAgent({ __proto__: {}, model: 'x', tools: [], name: 'agent' });",
    );
    const result = getLangChainAgentDefinition(analysis, 'agent');

    expect(result).toMatchObject({
      definition: {
        middleware: { kind: 'unresolved' },
        name: { kind: 'unresolved' },
        responseFormat: { kind: 'unresolved' },
        systemPrompt: { kind: 'unresolved' },
        tools: { kind: 'unresolved' },
      },
      kind: 'present-supported',
    });
  });

  test.each([
    "import { createAgent } from 'langchain/agents'; export const agent = createAgent({ model: 'x' });",
    "import { createAgent } from 'langchain'; const config = { model: 'x' }; export const agent = createAgent(config);",
    "import { createAgent } from 'langchain'; export const agent = createAgent({ model: 'x', unknown: true });",
  ])('keeps unsupported agent form present without selecting it', (source) => {
    expect(getLangChainAgentDefinition(analyze(source), 'agent').kind).toBe('present-unsupported');
  });

  test('recognizes only the normal two-argument tool overload', () => {
    const analysis = analyze(
      "import { tool as defineTool } from 'langchain/tools'; const run = () => undefined; export const normalTool = defineTool(run, { name: 'run' }); export const headlessTool = defineTool({ name: 'headless' });",
    );

    expect(getLangChainFunctionTool(analysis, 'normalTool')).toMatchObject({
      kind: 'present-supported',
      tool: {
        description: { kind: 'absent' },
        helperSource: 'langchain/tools',
        schema: { kind: 'absent' },
      },
    });
    expect(getLangChainFunctionTool(analysis, 'headlessTool').kind).toBe('present-unsupported');
  });

  test('retains description closure for exported and inline normal tools', () => {
    const analysis = analyze(
      "import { tool } from 'langchain'; const run = () => undefined; export const normalTool = tool(run, { name: 'run', description: getDescription() }); const inlineTool = tool(run, { name: 'inline', description: 'Inline tool.' }); export const tools = [inlineTool];",
    );
    const exported = getLangChainFunctionTool(analysis, 'normalTool');
    const inlineDeclaration = analysis.moduleConstDeclarations.get('inlineTool')?.initializer;

    expect(exported).toMatchObject({
      kind: 'present-supported',
      tool: { description: { kind: 'present' } },
    });
    expect(inlineDeclaration).toBeDefined();

    if (inlineDeclaration !== undefined) {
      expect(getInlineLangChainFunctionTool(inlineDeclaration, analysis)).toMatchObject({
        description: { kind: 'present' },
        helperSource: 'langchain',
      });
    }
  });

  test.each([
    ['name', 'normalTool.name = replacement;', 'unresolved', 'present', 'present'],
    ['schema', 'normalTool.schema = replacement;', 'present', 'present', 'unresolved'],
    ['func', 'normalTool.func = replacement;', 'present', 'unresolved', 'present'],
    ['invoke', 'normalTool.invoke = replacement;', 'present', 'unresolved', 'present'],
    ['description', 'normalTool.description = replacement;', 'present', 'present', 'present'],
    ['metadata', 'normalTool.metadata = replacement;', 'present', 'present', 'present'],
    [
      'schema through Object.assign',
      'Object.assign(normalTool, { schema: replacement });',
      'present',
      'present',
      'unresolved',
    ],
    [
      'invoke through Reflect.set',
      "Reflect.set(normalTool, 'invoke', replacement);",
      'present',
      'unresolved',
      'present',
    ],
  ] as const)(
    'keeps a %s mutation relationship-local',
    (_member, mutation, expectedName, expectedImplementation, expectedSchema) => {
      const analysis = analyze(
        `import { tool } from 'langchain'; const run = () => undefined; const InputSchema = {}; export const normalTool = tool(run, { name: 'run', description: 'Run.', schema: InputSchema }); ${mutation}`,
      );

      expect(getLangChainFunctionTool(analysis, 'normalTool')).toMatchObject({
        kind: 'present-supported',
        tool: {
          description: { kind: 'present' },
          implementation: { kind: expectedImplementation },
          name: { kind: expectedName },
          schema: { kind: expectedSchema },
        },
      });
    },
  );

  test('keeps every function-tool relationship unresolved after an unproved escape', () => {
    const analysis = analyze(
      "import { tool } from 'langchain'; const run = () => undefined; const InputSchema = {}; export const normalTool = tool(run, { name: 'run', schema: InputSchema }); consume(normalTool);",
    );

    expect(getLangChainFunctionTool(analysis, 'normalTool')).toMatchObject({
      kind: 'present-supported',
      tool: {
        implementation: { kind: 'unresolved' },
        name: { kind: 'unresolved' },
        schema: { kind: 'unresolved' },
      },
    });
  });
});
