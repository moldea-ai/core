// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  analyzeAnthropicMessages,
  analyzeAnthropicSource,
  getAnthropicClosedObjectProperties,
  getAnthropicConstExport,
  getAnthropicRuntimeExport,
  getAnthropicStaticString,
  isAnthropicBoundIdentifier,
  isSafeAnthropicModuleArray,
  isAnthropicStaticLiteralValue,
  resolveAnthropicImportCandidatePaths,
} from './index.js';

const analyze = (source: string) => {
  const result = analyzeAnthropicSource(
    parseRepositoryPath('/src/agent.ts'),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError('The source fixture must be valid.');
  }

  return result.analysis;
};

const findMessages = (source: string, symbol = 'agent') => {
  const analysis = analyze(source);
  const runtime = getAnthropicRuntimeExport(analysis, symbol);

  if (runtime.kind !== 'present-supported' || runtime.body === undefined) {
    throw new TypeError('The runtime fixture must use a supported export.');
  }

  return { analysis, messages: analyzeAnthropicMessages(analysis, runtime.body) };
};

describe('analyzeAnthropicSource', () => {
  test('indexes aliases, module clients, exports, and closed Messages requests', () => {
    const { analysis, messages } = findMessages(
      [
        "import AnthropicClient from '@anthropic-ai/sdk';",
        "import { loadInstruction as readInstruction } from './instructions.js';",
        'const client = new AnthropicClient();',
        'export const agent = async () =>',
        '  client.messages.create({ system: await readInstruction() });',
      ].join('\n'),
    );
    const instructions =
      messages.requests[0]?.system.kind === 'present'
        ? messages.requests[0].system.expression
        : undefined;

    expect(analysis.anthropicConstructorNames).toStrictEqual(new Set(['AnthropicClient']));
    expect(analysis.clientNames).toStrictEqual(new Set(['client']));
    expect(analysis.exports.has('agent')).toBe(true);
    expect(messages.requests).toHaveLength(1);
    expect(messages.requests[0]?.system.kind).toBe('present');

    if (instructions === undefined || !ts.isAwaitExpression(instructions)) {
      throw new TypeError('The instruction fixture must preserve its direct await expression.');
    }

    const call = instructions.expression;

    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) {
      throw new TypeError('The instruction fixture must contain a direct call.');
    }

    expect(
      isAnthropicBoundIdentifier(call.expression, analysis, {
        path: parseRepositoryPath('/src/instructions.ts'),
        symbol: 'loadInstruction',
      }),
    ).toBe(true);
  });

  test('unwraps direct exported constants and indexes closed registration properties', () => {
    const analysis = analyze(
      "export const tool = ({ type: 'custom', name: 'find_order' } as const) satisfies object;",
    );
    const exported = getAnthropicConstExport(analysis, 'tool');

    if (
      exported.kind !== 'present-supported' ||
      exported.expression === undefined ||
      !ts.isObjectLiteralExpression(exported.expression)
    ) {
      throw new TypeError('The registration fixture must be a supported object literal.');
    }

    const properties = getAnthropicClosedObjectProperties(exported.expression);

    expect(properties).not.toBeNull();
    expect(getAnthropicStaticString(properties?.get('type'))).toBe('custom');
    expect(getAnthropicStaticString(properties?.get('name'))).toBe('find_order');
  });

  test.each([
    ["export const tool = { name: 'first', name: 'second' };", 'duplicate property'],
    ["export const tool = { ['name']: 'first' };", 'computed property'],
    ["export const tool = { ...other, name: 'first' };", 'spread property'],
  ])('rejects a %s from closed object analysis', (source) => {
    const exported = getAnthropicConstExport(analyze(source), 'tool');

    if (
      exported.kind !== 'present-supported' ||
      exported.expression === undefined ||
      !ts.isObjectLiteralExpression(exported.expression)
    ) {
      throw new TypeError('The object fixture must be a direct exported constant.');
    }

    expect(getAnthropicClosedObjectProperties(exported.expression)).toBeNull();
  });

  test('rejects invalid source text and syntax', () => {
    expect(
      analyzeAnthropicSource(parseRepositoryPath('/src/agent.ts'), Uint8Array.from([0xff])),
    ).toStrictEqual({ kind: 'invalid-text' });
    expect(
      analyzeAnthropicSource(
        parseRepositoryPath('/src/agent.ts'),
        new TextEncoder().encode('export const = ;'),
      ),
    ).toMatchObject({ kind: 'invalid-syntax' });
  });

  test('supports multiple closed calls and tracks an indirect candidate separately', () => {
    const multiple = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        '  client.messages.create({ input: 1 });',
        '  client.messages.create({ input: 2 });',
        '  return client.messages.create(request);',
        '};',
      ].join('\n'),
    ).messages;

    expect(multiple.requests).toHaveLength(2);
    expect(multiple.hasAmbiguousCandidate).toBe(true);
  });

  test('recognizes named constructor aliases, request options, and ignored stream properties', () => {
    const { analysis, messages } = findMessages(
      [
        "import { Anthropic as AnthropicClient } from '@anthropic-ai/sdk';",
        'const client = new AnthropicClient();',
        'export const agent = () =>',
        '  client.messages.create(',
        '    { system: loadInstruction(), stream: shouldStream(), tools: [] },',
        '    { signal: abortSignal },',
        '  );',
      ].join('\n'),
    );

    expect(analysis.anthropicConstructorNames).toStrictEqual(new Set(['AnthropicClient']));
    expect(messages.hasAmbiguousCandidate).toBe(false);
    expect(messages.requests).toHaveLength(1);
    expect(messages.requests[0]?.system.kind).toBe('present');
    expect(messages.requests[0]?.tools.kind).toBe('present');
  });

  test.each([
    ['type-only named import', "import type { Anthropic } from '@anthropic-ai/sdk';"],
    ['namespace import', "import * as AnthropicSdk from '@anthropic-ai/sdk';"],
  ])('does not treat a %s as constructor evidence', (_description, importStatement) => {
    const analysis = analyze(
      [
        importStatement,
        'const client = new Anthropic();',
        'export const agent = () => client.messages.create({});',
      ].join('\n'),
    );

    expect(analysis.clientNames).toStrictEqual(new Set());
  });

  test.each([
    ['messages stream helper', 'client.messages.stream({})'],
    ['beta Messages API', 'client.beta.messages.create({})'],
    ['parse helper', 'client.messages.parse({})'],
  ])('does not recognize the unsupported %s', (_description, expression) => {
    const analysis = analyze(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        `export const agent = () => ${expression};`,
      ].join('\n'),
    );
    const runtime = getAnthropicRuntimeExport(analysis, 'agent');

    if (runtime.kind !== 'present-supported' || runtime.body === undefined) {
      throw new TypeError('The runtime fixture must be supported.');
    }

    expect(analyzeAnthropicMessages(analysis, runtime.body).requests).toStrictEqual([]);
  });

  test('tracks request relationships independently with ordered object members', () => {
    const { messages } = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        '  client.messages.create({',
        '    [dynamicKey]: dynamicValue,',
        '    system: loadInstruction(),',
        '    model: getModel(),',
        '  });',
        '  client.messages.create({',
        '    ...dynamicRequest,',
        '    system: loadInstruction(),',
        '    tools: [registration],',
        '  });',
        '  client.messages.create({',
        '    system: loadInstruction(),',
        '    tools: [registration],',
        '    ...dynamicRequest,',
        '  });',
        '  return client.messages.create({',
        '    system: firstLoader(),',
        '    system: secondLoader(),',
        '    tools: [registration],',
        '  });',
        '};',
      ].join('\n'),
    );

    expect(
      messages.requests.map(({ system, tools }) => ({
        system: system.kind,
        tools: tools.kind,
      })),
    ).toStrictEqual([
      { system: 'present', tools: 'unresolved' },
      { system: 'present', tools: 'present' },
      { system: 'unresolved', tools: 'unresolved' },
      { system: 'unresolved', tools: 'present' },
    ]);
    expect(messages.hasAmbiguousCandidate).toBe(false);
  });

  test.each([
    [
      'nested supported literals',
      "{ type: 'object', count: -1, positive: +2, items: [true, false, null, `text`, { nested: 0 }] }",
      true,
    ],
    ['array hole', '[true, , false]', false],
    ['array spread', '[...items]', false],
    ['object spread', '{ ...schema }', false],
    ['computed property', '{ [propertyName]: true }', false],
    ['shorthand property', '{ propertyName }', false],
    ['method', '{ propertyName() { return true; } }', false],
    ['interpolated template', '{ name: `value-${suffix}` }', false],
    ['regular expression', '{ pattern: /value/ }', false],
    ['BigInt literal', '{ count: 1n }', false],
    ['undefined', '{ missing: undefined }', false],
  ])('classifies %s in the static schema grammar', (_description, expression, expected) => {
    const analysis = analyze(`export const schema = ${expression};`);
    const schema = getAnthropicConstExport(analysis, 'schema');

    if (schema.kind !== 'present-supported' || schema.expression === undefined) {
      throw new TypeError('The schema fixture must be a direct exported constant.');
    }

    expect(isAnthropicStaticLiteralValue(schema.expression)).toBe(expected);
  });

  test('tracks an extracted Messages create member as an unresolved dynamic candidate', () => {
    const { messages } = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        '  client.messages.create({ input: 1 });',
        '  const create = client.messages.create;',
        '  return create({ system: loadInstruction() });',
        '};',
      ].join('\n'),
    );

    expect(messages.requests).toHaveLength(1);
    expect(messages.hasAmbiguousCandidate).toBe(true);
  });

  test.each([
    [
      'Messages object',
      '  const messages = client.messages;',
      '  return messages.create({ system: loadInstruction() });',
    ],
    [
      'Anthropic client',
      '  const delegatedClient = client;',
      '  return delegatedClient.messages.create({ system: loadInstruction() });',
    ],
    [
      'conditionally selected Anthropic client',
      '  const delegatedClient = condition ? client : fallbackClient;',
      '  return delegatedClient.messages.create({ system: loadInstruction() });',
    ],
  ])('tracks an aliased %s as an unresolved data-flow candidate', (_description, alias, call) => {
    const { messages } = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        '  client.messages.create({ input: 1 });',
        alias,
        call,
        '};',
      ].join('\n'),
    );

    expect(messages.requests).toHaveLength(1);
    expect(messages.hasAmbiguousCandidate).toBe(true);
  });

  test('does not treat an unrelated property name as an Anthropic client escape', () => {
    const { messages } = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        "  const metadata = { client: 'anthropic' };",
        '  void metadata;',
        '  return client.messages.create({ input: 1 });',
        '};',
      ].join('\n'),
    );

    expect(messages.requests).toHaveLength(1);
    expect(messages.hasAmbiguousCandidate).toBe(false);
  });

  test('tracks an unresolved Messages client as an ambiguous relationship candidate', () => {
    const { messages } = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        '  client.messages.create({ input: 1 });',
        '  return createClient().messages.create({ system: loadInstruction() });',
        '};',
      ].join('\n'),
    );

    expect(messages.requests).toHaveLength(1);
    expect(messages.hasAmbiguousCandidate).toBe(true);
  });

  test('does not traverse nested functions, callbacks, methods, classes, or returned functions', () => {
    const { messages } = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        '  const nested = () => client.messages.create({ input: 1 });',
        '  [1].map(() => client.messages.create({ input: 2 }));',
        '  class Nested { run() { return client.messages.create({ input: 3 }); } }',
        '  return nested;',
        '};',
      ].join('\n'),
    );
    const returned = findMessages(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => () => client.messages.create({ input: 1 });',
      ].join('\n'),
    ).messages;

    expect(messages.requests).toStrictEqual([]);
    expect(returned.requests).toStrictEqual([]);
  });

  test.each([
    [
      'parameter',
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = (client: Anthropic) => client.messages.create({ input: 1 });',
      ].join('\n'),
    ],
    [
      'local variable',
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'export const agent = () => {',
        '  const client = { messages: { create: () => ({}) } };',
        '  return client.messages.create({ input: 1 });',
        '};',
      ].join('\n'),
    ],
  ])('does not bind a Messages request through a shadowing %s', (_description, source) => {
    expect(findMessages(source).messages.requests).toStrictEqual([]);
  });

  test('does not interpret type-only imports as runtime wiring', () => {
    const { analysis, messages } = findMessages(
      [
        "import type Anthropic from '@anthropic-ai/sdk';",
        "import { type loadInstruction } from './instructions.js';",
        'const client = new Anthropic();',
        'export const agent = () =>',
        '  client.messages.create({ system: loadInstruction() });',
      ].join('\n'),
    );

    expect(analysis.anthropicConstructorNames).toStrictEqual(new Set());
    expect(analysis.clientNames).toStrictEqual(new Set());
    expect(analysis.namedImports).toStrictEqual(new Map());
    expect(messages.requests).toStrictEqual([]);
  });

  test('classifies default-export and indirect-export runtime symbols as unsupported', () => {
    const defaultExport = analyze('export default function agent() {}');
    const indirectExport = analyze('const agent = () => undefined; export { agent };');

    expect(getAnthropicRuntimeExport(defaultExport, 'agent').kind).toBe('present-unsupported');
    expect(getAnthropicRuntimeExport(indirectExport, 'agent').kind).toBe('present-unsupported');
  });

  test('resolves only exact TypeScript and explicit JavaScript ESM source specifiers', () => {
    const containingPath = parseRepositoryPath('/src/agent.ts');

    expect(resolveAnthropicImportCandidatePaths(containingPath, './tool.js')).toStrictEqual([
      '/src/tool.ts',
      '/src/tool.tsx',
    ]);
    expect(resolveAnthropicImportCandidatePaths(containingPath, './tool.mjs')).toStrictEqual([
      '/src/tool.mts',
    ]);
    expect(resolveAnthropicImportCandidatePaths(containingPath, './tool.ts')).toStrictEqual([
      '/src/tool.ts',
    ]);
    expect(resolveAnthropicImportCandidatePaths(containingPath, './tool')).toStrictEqual([]);
  });

  test('accepts reusable module tool arrays and rejects mutation or aliasing', () => {
    const safe = analyze(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'const tools = [registration];',
        'export const agent = () => client.messages.create({ tools });',
      ].join('\n'),
    );
    const safelyObserved = analyze(
      [
        "import Anthropic from '@anthropic-ai/sdk';",
        'const client = new Anthropic();',
        'const tools = [registration];',
        'const copiedTools = tools.slice();',
        'export const agent = () => client.messages.create({ tools });',
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

    expect(isSafeAnthropicModuleArray(safe, 'tools')).toBe(true);
    expect(isSafeAnthropicModuleArray(safelyObserved, 'tools')).toBe(true);
    expect(isSafeAnthropicModuleArray(mutated, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(aliased, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(computedMutation, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(dynamicMutation, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(deletedMember, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(returnedFromConciseArrow, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(destructuredMemberMutation, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(contained, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(callbackExposed, 'tools')).toBe(false);
    expect(isSafeAnthropicModuleArray(forOfMemberMutation, 'tools')).toBe(false);
  });
});
