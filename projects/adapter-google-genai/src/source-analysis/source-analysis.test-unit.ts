// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { getRuntimeExport } from '@moldea.ai/adapter-static-analysis';
import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  analyzeGoogleGenAiGenerateContent,
  analyzeGoogleGenAiSource,
  getGoogleGenAiFunctionDeclarationShape,
  isGoogleGenAiFunctionNameValid,
} from './index.js';

const analyze = (source: string) => {
  const result = analyzeGoogleGenAiSource(
    parseRepositoryPath('/src/agent.ts'),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError('The Google Gen AI source fixture must be valid.');
  }

  return result.analysis;
};

const findGenerateContent = (source: string) => {
  const analysis = analyze(source);
  const runtime = getRuntimeExport(analysis, 'agent');

  if (runtime.kind !== 'present-supported' || runtime.body === undefined) {
    throw new TypeError('The runtime fixture must use a supported export.');
  }

  return {
    analysis,
    generateContent: analyzeGoogleGenAiGenerateContent(analysis, runtime.body),
  };
};

describe('Google Gen AI source analysis', () => {
  test('indexes an aliased named value import and direct generate-content request', () => {
    const { analysis, generateContent } = findGenerateContent(
      [
        "import { GoogleGenAI as GenAi } from '@google/genai';",
        'const client = new (GenAi)({ apiKey: getApiKey() });',
        'export const agent = async () =>',
        '  await client.models.generateContent({',
        '    model: getModel(),',
        '    config: { systemInstruction: await loadInstruction(), tools: [] },',
        '    contents: getContents(),',
        '  });',
      ].join('\n'),
    );

    expect(analysis.googleGenAiConstructorNames).toStrictEqual(new Set(['GenAi']));
    expect(analysis.clientNames).toStrictEqual(new Set(['client']));
    expect(generateContent.hasAmbiguousCandidate).toBe(false);
    expect(generateContent.requests).toHaveLength(1);
    expect(generateContent.requests[0]).toMatchObject({
      config: { kind: 'present' },
      systemInstruction: { kind: 'present' },
      tools: { kind: 'present' },
    });
  });

  test('keeps request and nested configuration closure relationship-specific', () => {
    const { generateContent } = findGenerateContent(
      [
        "import { GoogleGenAI } from '@google/genai';",
        'const client = new GoogleGenAI();',
        'export const agent = () => {',
        '  client.models.generateContent({',
        '    [requestKey]: requestValue,',
        '    config: { [configKey]: configValue, systemInstruction: loadInstruction() },',
        '  });',
        '  return client.models.generateContent({',
        '    ...request,',
        '    config: { tools: [], ...config },',
        '  });',
        '};',
      ].join('\n'),
    );

    expect(
      generateContent.requests.map(({ systemInstruction, tools }) => ({
        systemInstruction: systemInstruction.kind,
        tools: tools.kind,
      })),
    ).toStrictEqual([
      { systemInstruction: 'present', tools: 'unresolved' },
      { systemInstruction: 'unresolved', tools: 'unresolved' },
    ]);
  });

  test.each([
    ['a default import', "import GoogleGenAI from '@google/genai';"],
    ['a namespace import', "import * as Google from '@google/genai';"],
    ['a type-only import', "import type { GoogleGenAI } from '@google/genai';"],
    ['a subpath import', "import { GoogleGenAI } from '@google/genai/node';"],
    [
      'the legacy package',
      "import { GoogleGenerativeAI as GoogleGenAI } from '@google/generative-ai';",
    ],
  ])('does not establish a client through %s', (_description, importStatement) => {
    const analysis = analyze(
      [
        importStatement,
        'const client = new GoogleGenAI();',
        'export const agent = () => client.models.generateContent({});',
      ].join('\n'),
    );

    expect(analysis.clientNames).toStrictEqual(new Set());
  });

  test.each([
    ['computed models', "client['models'].generateContent({})"],
    ['computed method', "client.models['generateContent']({})"],
    ['streaming', 'client.models.generateContentStream({})'],
    ['dynamic request', 'client.models.generateContent(request)'],
    ['two arguments', 'client.models.generateContent({}, options)'],
  ])('does not recognize %s as a supported direct call', (_description, expression) => {
    const { generateContent } = findGenerateContent(
      [
        "import { GoogleGenAI } from '@google/genai';",
        'const client = new GoogleGenAI();',
        `export const agent = () => ${expression};`,
      ].join('\n'),
    );

    expect(generateContent.requests).toStrictEqual([]);
  });

  test('validates the supported function declaration shape and alternative schema exclusion', () => {
    const supportedAnalysis = analyze(
      "export const registration = { name: `find_order`, description: 'Finds an order', parametersJsonSchema: { type: 'object', minimum: -1 }, behavior: dynamicBehavior };",
    );
    const unsupportedAnalysis = analyze(
      "export const registration = { name: 'find_order', parameters: { type: 'OBJECT' } };",
    );

    expect(getGoogleGenAiFunctionDeclarationShape(supportedAnalysis, 'registration').kind).toBe(
      'present-supported',
    );
    expect(getGoogleGenAiFunctionDeclarationShape(unsupportedAnalysis, 'registration').kind).toBe(
      'present-unsupported',
    );
  });

  test.each([
    ['a', true],
    ['_find.order:by-id', true],
    ['a'.repeat(128), true],
    ['', false],
    ['a'.repeat(129), false],
    ['1find', false],
    ['find order', false],
    ['find/order', false],
    ['buscar_orden_ñ', false],
  ])('isGoogleGenAiFunctionNameValid(%s) -> %s', (name, expected) => {
    expect(isGoogleGenAiFunctionNameValid(name)).toBe(expected);
  });

  test('rejects invalid normalized text and TypeScript syntax', () => {
    expect(
      analyzeGoogleGenAiSource(parseRepositoryPath('/src/agent.ts'), Uint8Array.from([0xff])),
    ).toStrictEqual({ kind: 'invalid-text' });
    expect(
      analyzeGoogleGenAiSource(
        parseRepositoryPath('/src/agent.ts'),
        new TextEncoder().encode('export const = ;'),
      ),
    ).toMatchObject({ kind: 'invalid-syntax' });
  });

  test('skips nested lexical bodies and shadowed clients', () => {
    const nested = findGenerateContent(
      [
        "import { GoogleGenAI } from '@google/genai';",
        'const client = new GoogleGenAI();',
        'export const agent = () => {',
        '  const nestedCall = () => client.models.generateContent({});',
        '  return nestedCall;',
        '};',
      ].join('\n'),
    ).generateContent;
    const shadowed = findGenerateContent(
      [
        "import { GoogleGenAI } from '@google/genai';",
        'const client = new GoogleGenAI();',
        'export const agent = (client: GoogleGenAI) => client.models.generateContent({});',
      ].join('\n'),
    ).generateContent;

    expect(nested.requests).toStrictEqual([]);
    expect(shadowed.requests).toStrictEqual([]);
  });
});
