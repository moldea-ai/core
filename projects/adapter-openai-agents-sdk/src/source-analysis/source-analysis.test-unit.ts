// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  IOpenAiAgentsSdkInspectionSession,
  IOpenAiAgentsSdkSourceAnalysis,
  IOpenAiAgentsSdkSourceAnalysisResult,
} from '../contracts/index.js';
import {
  analyzeOpenAiAgentsSdkHandoffElement,
  analyzeOpenAiAgentsSdkMutations,
  analyzeOpenAiAgentsSdkSource,
  classifyOpenAiAgentsSdkInstructionLoader,
  classifyOpenAiAgentsSdkToolRegistration,
  collectOpenAiAgentsSdkHandoffCollectionReferences,
  collectOpenAiAgentsSdkHandoffTargetReferences,
  collectOpenAiAgentsSdkToolCollectionReferences,
  getOpenAiAgentsSdkAgentDefinition,
  getOpenAiAgentsSdkFunctionTool,
  getOpenAiAgentsSdkHandoffElements,
  resolveOpenAiAgentsSdkStaticString,
} from './index.js';

const analyze = (path: string, source: string): IOpenAiAgentsSdkSourceAnalysis => {
  const result = analyzeOpenAiAgentsSdkSource(
    parseRepositoryPath(path),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError('The source fixture must be valid.');
  }

  return result.analysis;
};

const createSession = (
  sources: Readonly<Record<string, string>>,
): IOpenAiAgentsSdkInspectionSession => {
  const analyses = new Map<string, IOpenAiAgentsSdkSourceAnalysisResult>();

  return {
    analyzeSource: (path) => {
      const existing = analyses.get(path);

      if (existing !== undefined) {
        return Promise.resolve(existing);
      }

      const source = sources[path];
      const result =
        source === undefined
          ? ({ kind: 'invalid-text' } as const)
          : analyzeOpenAiAgentsSdkSource(path, new TextEncoder().encode(source));
      analyses.set(path, result);
      return Promise.resolve(result);
    },
    discoverPackage: () => Promise.resolve({ kind: 'absent' }),
    getEntry: (path) =>
      Promise.resolve(
        sources[path] === undefined ? null : { path, size: sources[path].length, type: 'file' },
      ),
  };
};

describe('OpenAI Agents SDK source analysis', () => {
  test.each([
    ['new Agent', 'new RuntimeAgent({ name: "orders" })'],
    ['Agent.create', 'RuntimeAgent.create({ name: "orders" })'],
  ])('recognizes %s with a named root import alias', (_description, initializer) => {
    const analysis = analyze(
      '/src/agent.ts',
      `import { Agent as RuntimeAgent } from '@openai/agents';\nexport const ordersAgent = ${initializer};`,
    );
    const result = getOpenAiAgentsSdkAgentDefinition(analysis, 'ordersAgent');

    expect(result.kind).toBe('present-supported');
    expect(result.definition?.name.kind).toBe('present');
    expect(getOpenAiAgentsSdkAgentDefinition(analysis, 'missing')).toStrictEqual({
      kind: 'absent',
    });
  });

  test('keeps Agent configuration closure and mutation state relationship-specific', () => {
    const analysis = analyze(
      '/src/agent.ts',
      [
        "import { Agent } from '@openai/agents';",
        'export const agent = new Agent({',
        "  name: 'orders',",
        '  instructions: loadInstructions,',
        '  outputType: OutputSchema,',
        '  ...dynamicConfig,',
        '});',
        "agent.name = 'mutated';",
      ].join('\n'),
    );
    const result = getOpenAiAgentsSdkAgentDefinition(analysis, 'agent');

    expect(result.definition).toMatchObject({
      instructions: { kind: 'unresolved' },
      name: { kind: 'unresolved' },
      outputType: { kind: 'unresolved' },
      tools: { kind: 'unresolved' },
    });

    if (result.definition === undefined) {
      throw new TypeError('The Agent definition must be supported.');
    }

    const mutations = analyzeOpenAiAgentsSdkMutations(
      analysis,
      result.definition.declaration,
      new Set(),
    );
    expect(mutations.hasUnknownMutation).toBe(false);
    expect(mutations.mutatedMembers).toStrictEqual(new Set(['name']));
  });

  test.each([
    [
      'default import',
      "import Agent from '@openai/agents';\nexport const agent = new Agent({ name: 'orders' });",
    ],
    [
      'namespace import',
      "import * as Agents from '@openai/agents';\nexport const agent = new Agents.Agent({ name: 'orders' });",
    ],
    [
      'type-only import',
      "import type { Agent } from '@openai/agents';\nexport const agent = new Agent({ name: 'orders' });",
    ],
    [
      'subpath import',
      "import { Agent } from '@openai/agents-core';\nexport const agent = new Agent({ name: 'orders' });",
    ],
    [
      'referenced configuration',
      "import { Agent } from '@openai/agents';\nconst config = { name: 'orders' };\nexport const agent = new Agent(config);",
    ],
    [
      'mutable binding',
      "import { Agent } from '@openai/agents';\nexport let agent = new Agent({ name: 'orders' });",
    ],
    [
      'separate export',
      "import { Agent } from '@openai/agents';\nconst agent = new Agent({ name: 'orders' });\nexport { agent };",
    ],
    [
      'computed create access',
      "import { Agent } from '@openai/agents';\nexport const agent = Agent['create']({ name: 'orders' });",
    ],
    [
      'extra constructor argument',
      "import { Agent } from '@openai/agents';\nexport const agent = new Agent({ name: 'orders' }, {});",
    ],
  ])('rejects an Agent definition using a %s', (_description, source) => {
    const analysis = analyze('/src/agent.ts', source);

    expect(getOpenAiAgentsSdkAgentDefinition(analysis, 'agent').kind).toBe('present-unsupported');
  });

  test('supports generic and transparent wrappers while ignoring unrelated dynamic properties', () => {
    const analysis = analyze(
      '/src/agent.ts',
      [
        "import { Agent } from '@openai/agents';",
        'export const agent = (new Agent<unknown>(({',
        "  name: 'orders',",
        '  model: createModel(),',
        '}) satisfies object) as Agent<unknown>);',
      ].join('\n'),
    );
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'agent').definition;

    expect(definition).toMatchObject({
      handoffs: { kind: 'absent' },
      instructions: { kind: 'absent' },
      name: { kind: 'present' },
      outputType: { kind: 'absent' },
      tools: { kind: 'absent' },
    });
  });

  test('keeps only a duplicated Agent relationship unresolved', () => {
    const analysis = analyze(
      '/src/agent.ts',
      [
        "import { Agent } from '@openai/agents';",
        'export const agent = new Agent({',
        "  name: 'orders',",
        "  'name': 'orders-again',",
        '  instructions: loadInstructions,',
        '  outputType: OutputSchema,',
        '});',
      ].join('\n'),
    );

    expect(getOpenAiAgentsSdkAgentDefinition(analysis, 'agent').definition).toMatchObject({
      instructions: { kind: 'present' },
      name: { kind: 'unresolved' },
      outputType: { kind: 'present' },
      tools: { kind: 'absent' },
    });
  });

  test('resolves exact local and relative imported static strings with cycle protection', async () => {
    const sources = {
      '/src/agent.ts': [
        "import { Agent } from '@openai/agents';",
        "import { agentName as importedName } from './names.js';",
        'export const agent = new Agent({ name: importedName });',
      ].join('\n'),
      '/src/names.ts': 'const baseName = `orders`;\nexport const agentName = baseName;',
    };
    const session = createSession(sources);
    const result = await session.analyzeSource(parseRepositoryPath('/src/agent.ts'));

    if (result.kind !== 'valid') {
      throw new TypeError('The source fixture must be valid.');
    }

    const definition = getOpenAiAgentsSdkAgentDefinition(result.analysis, 'agent').definition;

    if (definition?.name.kind !== 'present') {
      throw new TypeError('The Agent name must be present.');
    }

    await expect(
      resolveOpenAiAgentsSdkStaticString(session, result.analysis, definition.name.expression),
    ).resolves.toMatchObject({ kind: 'supported', value: 'orders' });
  });

  test('recognizes direct, awaited, referenced, and single-return instruction loaders', () => {
    const source = [
      "import { Agent } from '@openai/agents';",
      'export const loadInstructions = () => `instructions`;',
      'export const direct = new Agent({ instructions: loadInstructions() });',
      'export const awaited = new Agent({ instructions: await loadInstructions() });',
      'export const referenced = new Agent({ instructions: loadInstructions });',
      'export const wrapped = new Agent({ instructions: async (context) => { return await loadInstructions(context); } });',
    ].join('\n');
    const analysis = analyze('/src/agent.ts', source);

    for (const symbol of ['direct', 'awaited', 'referenced', 'wrapped']) {
      const definition = getOpenAiAgentsSdkAgentDefinition(analysis, symbol).definition;
      expect(
        definition === undefined
          ? null
          : classifyOpenAiAgentsSdkInstructionLoader(definition.instructions, analysis, {
              path: parseRepositoryPath('/src/agent.ts'),
              symbol: 'loadInstructions',
            }),
      ).toBe(true);
    }
  });

  test.each([
    [
      'multi-statement wrapper',
      '(context) => { observe(context); return loadInstructions(context); }',
    ],
    ['conditional call', 'condition ? loadInstructions() : fallbackInstructions()'],
    ['property call', 'loaders.loadInstructions()'],
    ['indirect alias', 'loaderAlias'],
  ])('leaves a %s instruction relationship unresolved', (_description, instructions) => {
    const source = [
      "import { Agent } from '@openai/agents';",
      "import { loadInstructions } from './instructions.js';",
      'const loaderAlias = loadInstructions;',
      `export const agent = new Agent({ instructions: ${instructions} });`,
    ].join('\n');
    const analysis = analyze('/src/agent.ts', source);
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'agent').definition;

    expect(
      definition === undefined
        ? undefined
        : classifyOpenAiAgentsSdkInstructionLoader(definition.instructions, analysis, {
            path: parseRepositoryPath('/src/instructions.ts'),
            symbol: 'loadInstructions',
          }),
    ).toBeNull();
  });

  test('recognizes closed function tools and closed Agent tool collections', async () => {
    const source = [
      "import { Agent, tool } from '@openai/agents';",
      'export const executeOrder = () => undefined;',
      'export const InputSchema = {};',
      'export const findOrderTool = tool({',
      "  name: 'find_order',",
      "  description: 'Find an order.',",
      '  parameters: InputSchema,',
      '  execute: executeOrder,',
      '});',
      'const tools = [findOrderTool];',
      "export const agent = new Agent({ name: 'orders', tools });",
    ].join('\n');
    const analysis = analyze('/src/agent.ts', source);
    const registration = getOpenAiAgentsSdkFunctionTool(analysis, 'findOrderTool');
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'agent').definition;

    expect(registration.kind).toBe('present-supported');

    if (registration.kind !== 'present-supported' || definition === undefined) {
      throw new TypeError('The tool and Agent fixtures must be supported.');
    }

    await expect(
      resolveOpenAiAgentsSdkStaticString(
        createSession({ '/src/agent.ts': source }),
        analysis,
        registration.tool.name,
      ),
    ).resolves.toMatchObject({ kind: 'supported', value: 'find_order' });
    expect(
      classifyOpenAiAgentsSdkToolRegistration(
        definition.tools,
        analysis,
        { path: parseRepositoryPath('/src/agent.ts'), symbol: 'findOrderTool' },
        collectOpenAiAgentsSdkToolCollectionReferences([definition.tools]),
      ),
    ).toBe(true);
  });

  test('classifies returned function-tool mutations by effective runtime relationship', () => {
    const analysis = analyze(
      '/src/tool.ts',
      [
        "import { tool } from '@openai/agents';",
        'export const functionTool = tool({',
        "  name: 'find_order',",
        "  description: 'Find an order.',",
        '  parameters: InputSchema,',
        '  outputSchema: OutputSchema,',
        '  execute: findOrder,',
        '});',
        'functionTool.invoke = anotherImplementation;',
        'functionTool.execute = anotherImplementation;',
        "Object.assign(functionTool, { name: 'lookup_order', parameters: OtherSchema });",
        "Reflect.set(functionTool, 'outputSchema', OtherOutputSchema);",
      ].join('\n'),
    );
    const registration = getOpenAiAgentsSdkFunctionTool(analysis, 'functionTool');

    if (registration.kind !== 'present-supported') {
      throw new TypeError('The function-tool fixture must be supported.');
    }

    expect(
      analyzeOpenAiAgentsSdkMutations(analysis, registration.tool.declaration, new Set()),
    ).toStrictEqual({
      hasUnknownMutation: false,
      mutatedMembers: new Set(['execute', 'invoke', 'name', 'outputSchema', 'parameters']),
    });
  });

  test('accepts every verified function-tool property without interpreting its value', () => {
    const analysis = analyze(
      '/src/tool.ts',
      [
        "import { tool } from '@openai/agents';",
        'export const functionTool = tool({',
        "  name: 'find_order',",
        '  description: getDescription(),',
        '  parameters: InputSchema,',
        '  execute: findOrder,',
        '  outputSchema: OutputSchema,',
        '  allowedCallers: allowedCallers,',
        '  customDataExtractor: customDataExtractor,',
        '  deferLoading: deferLoading,',
        '  errorFunction: errorFunction,',
        '  inputGuardrails: inputGuardrails,',
        '  isEnabled: isEnabled,',
        '  needsApproval: needsApproval,',
        '  outputGuardrails: outputGuardrails,',
        '  providerData: providerData,',
        '  strict: strict,',
        '  timeoutBehavior: timeoutBehavior,',
        '  timeoutErrorFunction: timeoutErrorFunction,',
        '  timeoutMs: timeoutMs,',
        '});',
      ].join('\n'),
    );

    expect(getOpenAiAgentsSdkFunctionTool(analysis, 'functionTool').kind).toBe('present-supported');
  });

  test.each([
    ['unknown property', 'unsupportedProperty: true,'],
    ['object spread', '...dynamicConfig,'],
    ['shorthand property', 'description,'],
    ['method property', 'execute() {},'],
  ])('rejects a function-tool configuration with an %s', (_description, property) => {
    const analysis = analyze(
      '/src/tool.ts',
      [
        "import { tool } from '@openai/agents';",
        'export const functionTool = tool({',
        "  name: 'find_order',",
        "  description: 'Find an order.',",
        '  parameters: InputSchema,',
        '  execute: findOrder,',
        `  ${property}`,
        '});',
      ].join('\n'),
    );

    expect(getOpenAiAgentsSdkFunctionTool(analysis, 'functionTool').kind).toBe(
      'present-unsupported',
    );
  });

  test.each([
    ['closed inline collection', '[declaredTool]', true],
    ['closed collection proving absence', '[anotherTool]', false],
    ['unsupported collection element', '[createHostedTool()]', null],
    ['spread collection', '[...baseTools, declaredTool]', null],
  ])('classifies a %s', (_description, tools, expectedResult) => {
    const analysis = analyze(
      '/src/tools.ts',
      [
        "import { Agent, tool } from '@openai/agents';",
        'export const declaredTool = tool({',
        "  name: 'declared_tool',",
        "  description: 'Declared.',",
        '  parameters: InputSchema,',
        '  execute: executeDeclared,',
        '});',
        'export const anotherTool = tool({',
        "  name: 'another_tool',",
        "  description: 'Another.',",
        '  parameters: InputSchema,',
        '  execute: executeAnother,',
        '});',
        `export const agent = new Agent({ tools: ${tools} });`,
      ].join('\n'),
    );
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'agent').definition;

    expect(
      definition === undefined
        ? undefined
        : classifyOpenAiAgentsSdkToolRegistration(
            definition.tools,
            analysis,
            { path: parseRepositoryPath('/src/tools.ts'), symbol: 'declaredTool' },
            collectOpenAiAgentsSdkToolCollectionReferences([definition.tools]),
          ),
    ).toBe(expectedResult);
  });

  test('rejects a mutated module tool collection but permits a length read', () => {
    const classify = (collectionUse: string): boolean | null | undefined => {
      const analysis = analyze(
        '/src/tools.ts',
        [
          "import { Agent, tool } from '@openai/agents';",
          'export const declaredTool = tool({',
          "  name: 'declared_tool',",
          "  description: 'Declared.',",
          '  parameters: InputSchema,',
          '  execute: executeDeclared,',
          '});',
          'const tools = [declaredTool];',
          collectionUse,
          'export const agent = new Agent({ tools });',
        ].join('\n'),
      );
      const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'agent').definition;

      return definition === undefined
        ? undefined
        : classifyOpenAiAgentsSdkToolRegistration(
            definition.tools,
            analysis,
            { path: parseRepositoryPath('/src/tools.ts'), symbol: 'declaredTool' },
            collectOpenAiAgentsSdkToolCollectionReferences([definition.tools]),
          );
    };

    expect(classify('tools.length;')).toBe(true);
    expect(classify('tools.push(createHostedTool());')).toBeNull();
  });

  test('keeps configured handoff name and description mutations relationship-specific', () => {
    const analysis = analyze(
      '/src/agents.ts',
      [
        "import { Agent, handoff } from '@openai/agents';",
        "export const targetAgent = new Agent({ name: 'target' });",
        'const configuredHandoff = handoff(targetAgent, {',
        "  toolNameOverride: 'route_target',",
        "  toolDescriptionOverride: 'Route target requests.',",
        '});',
        "configuredHandoff.toolName = 'mutated';",
        'const handoffs = [configuredHandoff];',
        "export const sourceAgent = new Agent({ name: 'source', handoffs });",
      ].join('\n'),
    );
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'sourceAgent').definition;

    if (definition === undefined) {
      throw new TypeError('The source Agent fixture must be supported.');
    }

    const elements = getOpenAiAgentsSdkHandoffElements(
      definition.handoffs,
      analysis,
      collectOpenAiAgentsSdkHandoffCollectionReferences([definition.handoffs]),
    );
    const configuredHandoff = elements?.[0];

    if (configuredHandoff === undefined || !ts.isIdentifier(configuredHandoff)) {
      throw new TypeError('The configured handoff fixture must resolve to an identifier.');
    }

    const registration = analyzeOpenAiAgentsSdkHandoffElement(
      configuredHandoff,
      analysis,
      new Set([configuredHandoff]),
    );

    expect(registration).toMatchObject({
      kind: 'handoff',
      toolDescriptionOverride: { kind: 'present' },
      toolNameOverride: { kind: 'unresolved' },
    });
  });

  test('recognizes direct and configured handoffs and preserves supported target uses', () => {
    const analysis = analyze(
      '/src/agents.ts',
      [
        "import { Agent, handoff } from '@openai/agents';",
        "export const billingAgent = new Agent({ name: 'billing', handoffDescription: 'Billing' });",
        'const billingHandoff = handoff(billingAgent, {',
        "  toolNameOverride: 'route_billing',",
        "  toolDescriptionOverride: 'Billing',",
        '});',
        'const handoffs = [billingAgent, billingHandoff];',
        "export const triageAgent = new Agent({ name: 'triage', handoffs });",
      ].join('\n'),
    );
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'triageAgent').definition;

    if (definition === undefined) {
      throw new TypeError('The Agent fixture must be supported.');
    }

    const collectionReferences = collectOpenAiAgentsSdkHandoffCollectionReferences([
      definition.handoffs,
    ]);
    const elements = getOpenAiAgentsSdkHandoffElements(
      definition.handoffs,
      analysis,
      collectionReferences,
    );

    expect(elements).toHaveLength(2);

    const wrapperReferences = new Set(
      (elements ?? []).filter((element): element is ts.Identifier => ts.isIdentifier(element)),
    );
    expect(
      (elements ?? []).map(
        (element) =>
          analyzeOpenAiAgentsSdkHandoffElement(element, analysis, wrapperReferences)?.kind,
      ),
    ).toStrictEqual(['agent', 'handoff']);
    expect(collectOpenAiAgentsSdkHandoffTargetReferences(analysis).size).toBe(2);
  });

  test.each([
    ['dynamic configuration', 'dynamicConfig', 'unresolved'],
    ['unknown property', '{ unsupportedProperty: true }', 'unresolved'],
    ['tolerated property', '{ onHandoff: callback }', 'absent'],
  ])(
    'preserves a handoff target with a %s while classifying overrides as %s',
    (_description, config, expectedOverrideKind) => {
      const analysis = analyze(
        '/src/agents.ts',
        [
          "import { Agent, handoff } from '@openai/agents';",
          "export const targetAgent = new Agent({ name: 'target' });",
          `const configuredHandoff = handoff(targetAgent, ${config});`,
          'const handoffs = [configuredHandoff];',
          "export const sourceAgent = new Agent({ name: 'source', handoffs });",
        ].join('\n'),
      );
      const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'sourceAgent').definition;
      const elements =
        definition === undefined
          ? null
          : getOpenAiAgentsSdkHandoffElements(
              definition.handoffs,
              analysis,
              collectOpenAiAgentsSdkHandoffCollectionReferences([definition.handoffs]),
            );
      const configuredHandoff = elements?.[0];
      const registration =
        configuredHandoff === undefined || !ts.isIdentifier(configuredHandoff)
          ? null
          : analyzeOpenAiAgentsSdkHandoffElement(
              configuredHandoff,
              analysis,
              new Set([configuredHandoff]),
            );

      expect(registration).toMatchObject({
        kind: 'handoff',
        toolDescriptionOverride: { kind: expectedOverrideKind },
        toolNameOverride: { kind: expectedOverrideKind },
      });
    },
  );

  test('rejects a target-changing handoff mutation and agent-as-tool delegation', () => {
    const analysis = analyze(
      '/src/agents.ts',
      [
        "import { Agent, handoff } from '@openai/agents';",
        "export const targetAgent = new Agent({ name: 'target' });",
        'const configuredHandoff = handoff(targetAgent);',
        'configuredHandoff.onInvokeHandoff = anotherInvocation;',
        'const handoffs = [configuredHandoff, targetAgent.asTool()];',
        "export const sourceAgent = new Agent({ name: 'source', handoffs });",
      ].join('\n'),
    );
    const definition = getOpenAiAgentsSdkAgentDefinition(analysis, 'sourceAgent').definition;
    const elements =
      definition === undefined
        ? null
        : getOpenAiAgentsSdkHandoffElements(
            definition.handoffs,
            analysis,
            collectOpenAiAgentsSdkHandoffCollectionReferences([definition.handoffs]),
          );

    expect(elements).toHaveLength(2);
    expect(
      (elements ?? []).map((element) =>
        analyzeOpenAiAgentsSdkHandoffElement(
          element,
          analysis,
          new Set(
            (elements ?? []).filter((candidate): candidate is ts.Identifier =>
              ts.isIdentifier(candidate),
            ),
          ),
        ),
      ),
    ).toStrictEqual([null, null]);
  });

  test('returns stable invalid text and syntax states', () => {
    expect(
      analyzeOpenAiAgentsSdkSource(parseRepositoryPath('/src/agent.ts'), Uint8Array.from([0xff])),
    ).toStrictEqual({ kind: 'invalid-text' });
    expect(
      analyzeOpenAiAgentsSdkSource(
        parseRepositoryPath('/src/agent.ts'),
        new TextEncoder().encode('export const = ;'),
      ),
    ).toMatchObject({ kind: 'invalid-syntax' });
  });
});
