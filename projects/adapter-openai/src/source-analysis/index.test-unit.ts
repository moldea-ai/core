// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  analyzeOpenAiResponses,
  analyzeOpenAiSource,
  getOpenAiClosedObjectProperties,
  getOpenAiConstExport,
  getOpenAiRuntimeExport,
  getOpenAiStaticString,
  isOpenAiBoundIdentifier,
  isSafeOpenAiModuleArray,
  resolveOpenAiImportCandidatePaths,
} from './index.js';

const analyze = (source: string) => {
  const result = analyzeOpenAiSource(
    parseRepositoryPath('/src/agent.ts'),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError('The source fixture must be valid.');
  }

  return result.analysis;
};

const findResponses = (source: string, symbol = 'agent') => {
  const analysis = analyze(source);
  const runtime = getOpenAiRuntimeExport(analysis, symbol);

  if (runtime.kind !== 'present-supported' || runtime.body === undefined) {
    throw new TypeError('The runtime fixture must use a supported export.');
  }

  return { analysis, responses: analyzeOpenAiResponses(analysis, runtime.body) };
};

describe('analyzeOpenAiSource', () => {
  test('indexes aliases, module clients, exports, and closed Responses requests', () => {
    const { analysis, responses } = findResponses(
      [
        "import OpenAIClient from 'openai';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new OpenAIClient();',
        'export const agent = async () =>',
        '  client.responses.create({ instructions: await readInstruction() });',
      ].join('\n'),
    );
    const instructions = responses.closedRequests[0]?.properties.get('instructions');

    expect(analysis.openAiConstructorNames).toStrictEqual(new Set(['OpenAIClient']));
    expect(analysis.clientNames).toStrictEqual(new Set(['client']));
    expect(analysis.exports.has('agent')).toBe(true);
    expect(responses.closedRequests).toHaveLength(1);
    expect(responses.closedRequests[0]?.properties.has('instructions')).toBe(true);

    if (instructions === undefined || !ts.isAwaitExpression(instructions)) {
      throw new TypeError('The instruction fixture must preserve its direct await expression.');
    }

    const call = instructions.expression;

    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) {
      throw new TypeError('The instruction fixture must contain a direct call.');
    }

    expect(
      isOpenAiBoundIdentifier(call.expression, analysis, {
        path: parseRepositoryPath('/src/instructions.ts'),
        symbol: 'loadInstruction',
      }),
    ).toBe(true);
  });

  test('unwraps direct exported constants and indexes closed registration properties', () => {
    const analysis = analyze(
      "export const tool = ({ type: 'function', name: 'find_order' } as const) satisfies object;",
    );
    const exported = getOpenAiConstExport(analysis, 'tool');

    if (
      exported.kind !== 'present-supported' ||
      exported.expression === undefined ||
      !ts.isObjectLiteralExpression(exported.expression)
    ) {
      throw new TypeError('The registration fixture must be a supported object literal.');
    }

    const properties = getOpenAiClosedObjectProperties(exported.expression);

    expect(properties).not.toBeNull();
    expect(getOpenAiStaticString(properties?.get('type'))).toBe('function');
    expect(getOpenAiStaticString(properties?.get('name'))).toBe('find_order');
  });

  test.each([
    ["export const tool = { name: 'first', name: 'second' };", 'duplicate property'],
    ["export const tool = { ['name']: 'first' };", 'computed property'],
    ["export const tool = { ...other, name: 'first' };", 'spread property'],
  ])('rejects a %s from closed object analysis', (source) => {
    const exported = getOpenAiConstExport(analyze(source), 'tool');

    if (
      exported.kind !== 'present-supported' ||
      exported.expression === undefined ||
      !ts.isObjectLiteralExpression(exported.expression)
    ) {
      throw new TypeError('The object fixture must be a direct exported constant.');
    }

    expect(getOpenAiClosedObjectProperties(exported.expression)).toBeNull();
  });

  test('rejects invalid source text and syntax', () => {
    expect(
      analyzeOpenAiSource(parseRepositoryPath('/src/agent.ts'), Uint8Array.from([0xff])),
    ).toStrictEqual({ kind: 'invalid-text' });
    expect(
      analyzeOpenAiSource(
        parseRepositoryPath('/src/agent.ts'),
        new TextEncoder().encode('export const = ;'),
      ),
    ).toMatchObject({ kind: 'invalid-syntax' });
  });

  test('supports multiple closed calls and tracks an indirect candidate separately', () => {
    const multiple = findResponses(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => {',
        '  client.responses.create({ input: 1 });',
        '  client.responses.create({ input: 2 });',
        '  return client.responses.create(request);',
        '};',
      ].join('\n'),
    ).responses;

    expect(multiple.closedRequests).toHaveLength(2);
    expect(multiple.hasAmbiguousCandidate).toBe(true);
  });

  test('tracks an extracted Responses create member as an unresolved dynamic candidate', () => {
    const { responses } = findResponses(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => {',
        '  client.responses.create({ input: 1 });',
        '  const create = client.responses.create;',
        '  return create({ instructions: loadInstruction() });',
        '};',
      ].join('\n'),
    );

    expect(responses.closedRequests).toHaveLength(1);
    expect(responses.hasAmbiguousCandidate).toBe(true);
  });

  test.each([
    [
      'Responses object',
      '  const responses = client.responses;',
      '  return responses.create({ instructions: loadInstruction() });',
    ],
    [
      'OpenAI client',
      '  const delegatedClient = client;',
      '  return delegatedClient.responses.create({ instructions: loadInstruction() });',
    ],
    [
      'conditionally selected OpenAI client',
      '  const delegatedClient = condition ? client : fallbackClient;',
      '  return delegatedClient.responses.create({ instructions: loadInstruction() });',
    ],
  ])('tracks an aliased %s as an unresolved data-flow candidate', (_description, alias, call) => {
    const { responses } = findResponses(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => {',
        '  client.responses.create({ input: 1 });',
        alias,
        call,
        '};',
      ].join('\n'),
    );

    expect(responses.closedRequests).toHaveLength(1);
    expect(responses.hasAmbiguousCandidate).toBe(true);
  });

  test('does not treat an unrelated property name as an OpenAI client escape', () => {
    const { responses } = findResponses(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => {',
        "  const metadata = { client: 'openai' };",
        '  void metadata;',
        '  return client.responses.create({ input: 1 });',
        '};',
      ].join('\n'),
    );

    expect(responses.closedRequests).toHaveLength(1);
    expect(responses.hasAmbiguousCandidate).toBe(false);
  });

  test('tracks an unresolved Responses client as an ambiguous relationship candidate', () => {
    const { responses } = findResponses(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => {',
        '  client.responses.create({ input: 1 });',
        '  return createClient().responses.create({ instructions: loadInstruction() });',
        '};',
      ].join('\n'),
    );

    expect(responses.closedRequests).toHaveLength(1);
    expect(responses.hasAmbiguousCandidate).toBe(true);
  });

  test('does not traverse nested functions, callbacks, methods, classes, or returned functions', () => {
    const { responses } = findResponses(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => {',
        '  const nested = () => client.responses.create({ input: 1 });',
        '  [1].map(() => client.responses.create({ input: 2 }));',
        '  class Nested { run() { return client.responses.create({ input: 3 }); } }',
        '  return nested;',
        '};',
      ].join('\n'),
    );
    const returned = findResponses(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => () => client.responses.create({ input: 1 });',
      ].join('\n'),
    ).responses;

    expect(responses.closedRequests).toStrictEqual([]);
    expect(returned.closedRequests).toStrictEqual([]);
  });

  test.each([
    [
      'parameter',
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = (client: OpenAI) => client.responses.create({ input: 1 });',
      ].join('\n'),
    ],
    [
      'local variable',
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'export const agent = () => {',
        '  const client = { responses: { create: () => ({}) } };',
        '  return client.responses.create({ input: 1 });',
        '};',
      ].join('\n'),
    ],
  ])('does not bind a Responses request through a shadowing %s', (_description, source) => {
    expect(findResponses(source).responses.closedRequests).toStrictEqual([]);
  });

  test('does not interpret type-only imports as runtime wiring', () => {
    const { analysis, responses } = findResponses(
      [
        "import type OpenAI from 'openai';",
        "import { type loadInstruction } from './instructions.js';",
        'const client = new OpenAI();',
        'export const agent = () =>',
        '  client.responses.create({ instructions: loadInstruction() });',
      ].join('\n'),
    );

    expect(analysis.openAiConstructorNames).toStrictEqual(new Set());
    expect(analysis.clientNames).toStrictEqual(new Set());
    expect(analysis.namedImports).toStrictEqual(new Map());
    expect(responses.closedRequests).toStrictEqual([]);
  });

  test('classifies default-export and indirect-export runtime symbols as unsupported', () => {
    const defaultExport = analyze('export default function agent() {}');
    const indirectExport = analyze('const agent = () => undefined; export { agent };');

    expect(getOpenAiRuntimeExport(defaultExport, 'agent').kind).toBe('present-unsupported');
    expect(getOpenAiRuntimeExport(indirectExport, 'agent').kind).toBe('present-unsupported');
  });

  test('resolves only exact TypeScript and explicit JavaScript ESM source specifiers', () => {
    const containingPath = parseRepositoryPath('/src/agent.ts');

    expect(resolveOpenAiImportCandidatePaths(containingPath, './tool.js')).toStrictEqual([
      '/src/tool.ts',
      '/src/tool.tsx',
    ]);
    expect(resolveOpenAiImportCandidatePaths(containingPath, './tool.mjs')).toStrictEqual([
      '/src/tool.mts',
    ]);
    expect(resolveOpenAiImportCandidatePaths(containingPath, './tool.ts')).toStrictEqual([
      '/src/tool.ts',
    ]);
    expect(resolveOpenAiImportCandidatePaths(containingPath, './tool')).toStrictEqual([]);
  });

  test('accepts reusable module tool arrays and rejects mutation or aliasing', () => {
    const safe = analyze(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'const tools = [registration];',
        'export const agent = () => client.responses.create({ tools });',
      ].join('\n'),
    );
    const safelyObserved = analyze(
      [
        "import OpenAI from 'openai';",
        'const client = new OpenAI();',
        'const tools = [registration];',
        'const copiedTools = tools.slice();',
        'export const agent = () => client.responses.create({ tools });',
      ].join('\n'),
    );
    const mutated = analyze(
      [
        'const tools = [registration];',
        'tools.push(otherRegistration);',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const aliased = analyze(
      [
        'const tools = [registration];',
        'const copiedTools = tools;',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const computedMutation = analyze(
      [
        'const tools = [registration];',
        "tools['push'](otherRegistration);",
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const dynamicMutation = analyze(
      [
        'const tools = [registration];',
        'tools[methodName](otherRegistration);',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const deletedMember = analyze(
      [
        'const tools = [registration];',
        'delete tools.length;',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const returnedFromConciseArrow = analyze(
      [
        'const tools = [registration];',
        'const exposeTools = () => tools;',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const destructuredMemberMutation = analyze(
      [
        'const tools = [registration];',
        '({ next: tools[0] } = source);',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const contained = analyze(
      [
        'const tools = [registration];',
        'const container = { tools };',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const callbackExposed = analyze(
      [
        'const tools = [registration];',
        'tools.forEach((_registration, _index, sourceTools) => sourceTools.push(otherRegistration));',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );
    const forOfMemberMutation = analyze(
      [
        'const tools = [registration];',
        'for ({ registration: tools[0] } of sources) {}',
        'export const agent = () => ({ tools });',
      ].join('\n'),
    );

    expect(isSafeOpenAiModuleArray(safe, 'tools')).toBe(true);
    expect(isSafeOpenAiModuleArray(safelyObserved, 'tools')).toBe(true);
    expect(isSafeOpenAiModuleArray(mutated, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(aliased, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(computedMutation, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(dynamicMutation, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(deletedMember, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(returnedFromConciseArrow, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(destructuredMemberMutation, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(contained, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(callbackExposed, 'tools')).toBe(false);
    expect(isSafeOpenAiModuleArray(forOfMemberMutation, 'tools')).toBe(false);
  });
});
