// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IVercelAiSdkSourceAnalysis } from '../contracts/index.js';
import {
  analyzeVercelAiSdkSource,
  getVercelAiSdkFunctionTool,
  getVercelAiSdkGenerationWrapper,
  getVercelAiSdkOutputSchema,
  getVercelAiSdkToolLoopAgentDefinition,
  getVercelAiSdkToolMap,
} from './index.js';

const analyze = (source: string): IVercelAiSdkSourceAnalysis => {
  const result = analyzeVercelAiSdkSource(
    parseRepositoryPath('/src/agent.ts'),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError('The source fixture must be valid.');
  }

  return result.analysis;
};

describe('Vercel AI SDK source analysis', () => {
  test('recognizes an aliased ToolLoopAgent and preserves relationship-local closure', () => {
    const analysis = analyze(
      [
        "import { ToolLoopAgent as Agent } from 'ai';",
        'export const supportAgent = new Agent({',
        "  id: 'support',",
        '  instructions: loadInstruction(),',
        '  callOptionsSchema: InputSchema,',
        '  output: outputSpec,',
        '  tools: toolMap,',
        '  model: createModel(),',
        '});',
      ].join('\n'),
    );
    const result = getVercelAiSdkToolLoopAgentDefinition(analysis, 'supportAgent');

    expect(result).toMatchObject({
      definition: {
        callOptionsSchema: { kind: 'present' },
        id: { kind: 'present' },
        instructions: { kind: 'present' },
        output: { kind: 'present' },
        tools: { kind: 'present' },
      },
      kind: 'present-supported',
    });
  });

  test('applies prepareCall and prepareStep only to the relationships they can replace', () => {
    const prepareCall = getVercelAiSdkToolLoopAgentDefinition(
      analyze(
        [
          "import { ToolLoopAgent } from 'ai';",
          'export const agent = new ToolLoopAgent({',
          "  id: 'stable', instructions: load(), callOptionsSchema: Input, output: result, tools,",
          '  prepareCall() { return {}; },',
          '});',
        ].join('\n'),
      ),
      'agent',
    );
    const prepareStep = getVercelAiSdkToolLoopAgentDefinition(
      analyze(
        [
          "import { ToolLoopAgent } from 'ai';",
          'export const agent = new ToolLoopAgent({',
          "  id: 'stable', instructions: load(), callOptionsSchema: Input, output: result, tools,",
          '  prepareStep() { return {}; },',
          '});',
        ].join('\n'),
      ),
      'agent',
    );

    if (prepareCall.kind !== 'present-supported' || prepareStep.kind !== 'present-supported') {
      throw new TypeError('The prepared ToolLoopAgent fixtures must be supported.');
    }

    expect(prepareCall.definition).toMatchObject({
      callOptionsSchema: { kind: 'present' },
      id: { kind: 'present' },
      instructions: { kind: 'unresolved' },
      output: { kind: 'unresolved' },
      tools: { kind: 'unresolved' },
    });
    expect(prepareStep.definition).toMatchObject({
      callOptionsSchema: { kind: 'present' },
      id: { kind: 'present' },
      instructions: { kind: 'unresolved' },
      output: { kind: 'present' },
      tools: { kind: 'present' },
    });
  });

  test('recognizes direct generateText and streamText calls but marks nested calls ambiguous', () => {
    const analysis = analyze(
      [
        "import { generateText as generate, streamText } from 'ai';",
        'export const run = async () => {',
        '  await generate({ instructions: load(), tools, output });',
        '  streamText({ system: load(), tools, output, prepareStep() { return {}; } });',
        '  return async () => generate({ instructions: load() });',
        '};',
      ].join('\n'),
    );
    const result = getVercelAiSdkGenerationWrapper(analysis, 'run');

    if (result.kind !== 'present-supported') {
      throw new TypeError('The generation wrapper fixture must be supported.');
    }

    expect(result).toMatchObject({
      kind: 'present-supported',
      wrapper: { hasAmbiguousCandidate: true },
    });
    expect(result.wrapper.requests.map(({ call }) => call)).toStrictEqual([
      'generateText',
      'streamText',
    ]);
    expect(result.wrapper.requests[1]?.instructions.kind).toBe('unresolved');
  });

  test.each([
    ['default import', "import Agent from 'ai';\nexport const agent = new Agent({});"],
    [
      'namespace import',
      "import * as AI from 'ai';\nexport const agent = new AI.ToolLoopAgent({});",
    ],
    [
      'type-only import',
      "import type { ToolLoopAgent } from 'ai';\nexport const agent = new ToolLoopAgent({});",
    ],
    [
      'subpath import',
      "import { ToolLoopAgent } from 'ai/tool';\nexport const agent = new ToolLoopAgent({});",
    ],
    [
      'referenced settings',
      "import { ToolLoopAgent } from 'ai';\nconst settings = {};\nexport const agent = new ToolLoopAgent(settings);",
    ],
  ])('rejects a ToolLoopAgent using a %s', (_description, source) => {
    expect(getVercelAiSdkToolLoopAgentDefinition(analyze(source), 'agent').kind).toBe(
      'present-unsupported',
    );
  });

  test('supports the closed function-tool contract and rejects unknown fields', () => {
    const supported = analyze(
      [
        "import { tool } from 'ai';",
        'export const findOrder = tool({',
        "  type: 'function', inputSchema: Input, outputSchema: Output, execute, metadata: create(),",
        '});',
      ].join('\n'),
    );
    const unsupported = analyze(
      [
        "import { tool } from 'ai';",
        'export const findOrder = tool({ inputSchema: Input, custom: true });',
      ].join('\n'),
    );

    expect(getVercelAiSdkFunctionTool(supported, 'findOrder')).toMatchObject({
      kind: 'present-supported',
      tool: {
        execute: { kind: 'present' },
        inputSchema: { kind: 'present' },
        outputSchema: { kind: 'present' },
      },
    });
    expect(getVercelAiSdkFunctionTool(unsupported, 'findOrder').kind).toBe('present-unsupported');
  });

  test('interprets __proto__ as a prototype setter except for shorthand tool-map keys', () => {
    const analysis = analyze(
      [
        "import { ToolLoopAgent } from 'ai';",
        'export const agent = new ToolLoopAgent({ __proto__: dynamic, instructions: load() });',
        'const __proto__ = toolValue;',
        'const map = { __proto__: ignored, __proto__, supported: toolValue };',
      ].join('\n'),
    );
    const definition = getVercelAiSdkToolLoopAgentDefinition(analysis, 'agent');
    const mapDeclaration = analysis.moduleConstDeclarations.get('map');

    if (mapDeclaration?.initializer === undefined) {
      throw new TypeError('The tools map must be present.');
    }

    if (definition.kind !== 'present-supported') {
      throw new TypeError('The ToolLoopAgent fixture must be supported.');
    }

    expect(definition.definition).toMatchObject({ instructions: { kind: 'unresolved' } });
    const mapInitializer = mapDeclaration.initializer;

    if (!ts.isObjectLiteralExpression(mapInitializer)) {
      throw new TypeError('The tools map fixture must be an object literal.');
    }

    expect(getVercelAiSdkToolMap(mapInitializer)).toMatchObject({
      entries: [{ name: '__proto__' }, { name: 'supported' }],
      kind: 'closed',
    });
  });

  test('recognizes only Output.object with the closed schema contract', () => {
    const analysis = analyze(
      [
        "import { Output as Result } from 'ai';",
        'const valid = Result.object({ schema: Schema, description: buildDescription() });',
        'const invalid = Result.object({ schema: Schema, unknown: true });',
      ].join('\n'),
    );
    const valid = analysis.moduleConstDeclarations.get('valid')?.initializer;
    const invalid = analysis.moduleConstDeclarations.get('invalid')?.initializer;

    if (valid === undefined || invalid === undefined) {
      throw new TypeError('The output fixtures must be present.');
    }

    expect(getVercelAiSdkOutputSchema(valid, analysis)).toMatchObject({ kind: 'present' });
    expect(getVercelAiSdkOutputSchema(invalid, analysis)).toStrictEqual({ kind: 'unresolved' });
  });
});
