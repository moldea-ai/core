// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test, vi } from 'vitest';

import type {
  IStaticAnalysisRequestRelationship,
  IStaticAnalysisSource,
  IStaticAnalysisToolRegistration,
} from '../types.js';
import { analyzeClientRequests } from '../typescript-analysis/requests.js';
import { analyzeSource, getRuntimeExport } from '../typescript-analysis/source-analysis.js';
import {
  classifyDirectCallRelationship,
  classifySchemaRelationship,
  classifyToolRelationships,
} from './relationships.js';

const SOURCE_CONFIG = {
  importConfig: {
    namedConstructorImports: ['Client'],
    packageName: 'provider',
    supportsDefaultConstructorImport: true,
  },
  requestConfig: {
    acceptedArgumentCounts: [1],
    methodName: 'create',
    relationshipNames: ['instructions', 'tools'],
    resourceName: 'messages',
    toolRelationshipName: 'tools',
  },
} as const;

const analyzeFixture = (path: string, source: string): IStaticAnalysisSource => {
  const result = analyzeSource(path, new TextEncoder().encode(source), SOURCE_CONFIG);

  if (result.kind !== 'valid') {
    throw new TypeError('The relationship fixture must be valid.');
  }

  return result.analysis;
};

const analyzeRelationships = (
  analysis: IStaticAnalysisSource,
  relationshipName: string,
): {
  readonly hasAmbiguousCandidate: boolean;
  readonly relationships: readonly IStaticAnalysisRequestRelationship[];
} => {
  const runtime = getRuntimeExport(analysis, 'agent');

  if (runtime.kind !== 'present-supported' || runtime.body === undefined) {
    throw new TypeError('The relationship fixture must export a supported agent.');
  }

  const requests = analyzeClientRequests(analysis, runtime.body, SOURCE_CONFIG.requestConfig);

  return {
    hasAmbiguousCandidate: requests.hasAmbiguousCandidate,
    relationships: requests.requests.map((request) => {
      const relationship = request.relationships.get(relationshipName);

      if (relationship === undefined) {
        throw new TypeError('The requested fixture relationship must be indexed.');
      }

      return relationship;
    }),
  };
};

describe('relationship analysis', () => {
  test('classifies direct instruction calls and schema bindings', () => {
    const analysis = analyzeFixture(
      '/src/agent.ts',
      [
        "import Client from 'provider';",
        "import { inputSchema, loadInstructions } from './bindings.js';",
        'const client = new Client();',
        'export const registration = { input_schema: inputSchema };',
        'export const agent = () =>',
        '  client.messages.create({ instructions: loadInstructions(), tools: [] });',
      ].join('\n'),
    );
    const instructionRelationships = analyzeRelationships(analysis, 'instructions');
    const registration = analysis.moduleConstDeclarations.get('registration');

    if (registration?.initializer === undefined) {
      throw new TypeError('The registration fixture must have an initializer.');
    }

    const object = registration.initializer;

    if (!ts.isObjectLiteralExpression(object)) {
      throw new TypeError('The registration fixture must be an object literal.');
    }

    const property = object.properties[0];

    if (property === undefined || !ts.isPropertyAssignment(property)) {
      throw new TypeError('The registration fixture must contain a schema property.');
    }

    expect(
      classifyDirectCallRelationship(
        analysis,
        instructionRelationships.relationships,
        instructionRelationships.hasAmbiguousCandidate,
        { path: '/src/bindings.ts', symbol: 'loadInstructions' },
      ),
    ).toStrictEqual({ kind: 'present' });
    expect(
      classifySchemaRelationship(analysis, property.initializer, {
        path: '/src/bindings.ts',
        symbol: 'inputSchema',
      }),
    ).toStrictEqual({ kind: 'present' });
  });

  test('classifies a representative large registration set without repeated scans', async () => {
    const registrationCount = 128;
    const symbols = Array.from({ length: registrationCount }, (_, index) => `tool${index}`);
    const analysis = analyzeFixture(
      '/src/agent.ts',
      [
        "import Client from 'provider';",
        `import { ${symbols.join(', ')} } from './tools.js';`,
        'const client = new Client();',
        `export const agent = () => client.messages.create({ tools: [${symbols.join(', ')}] });`,
      ].join('\n'),
    );
    const toolRelationships = analyzeRelationships(analysis, 'tools');
    const registrations: readonly IStaticAnalysisToolRegistration<string>[] = symbols.map(
      (symbol) => ({
        reference: { path: '/src/tools.ts', symbol },
        registration: symbol,
      }),
    );
    const getEntry = vi.fn();
    const analyzeRegistrationSource = vi.fn();
    const results = await classifyToolRelationships({
      analysis,
      analyzeSource: analyzeRegistrationSource,
      getEntry,
      hasAmbiguousCandidate: toolRelationships.hasAmbiguousCandidate,
      isSupportedAdditionalRegistration: () => false,
      registrations,
      relationships: toolRelationships.relationships,
    });

    expect(results).toHaveLength(registrationCount);
    expect(results.every(({ relationship }) => relationship.kind === 'present')).toBe(true);
    expect(getEntry).not.toHaveBeenCalled();
    expect(analyzeRegistrationSource).not.toHaveBeenCalled();
  });

  test('caches repeated additional registration resolution', async () => {
    const analysis = analyzeFixture(
      '/src/agent.ts',
      [
        "import Client from 'provider';",
        "import { extraTool } from './tools.js';",
        'const client = new Client();',
        'export const agent = () => {',
        '  client.messages.create({ tools: [extraTool] });',
        '  return client.messages.create({ tools: [extraTool] });',
        '};',
      ].join('\n'),
    );
    const toolRelationships = analyzeRelationships(analysis, 'tools');
    const registrationAnalysis = analyzeFixture(
      '/src/tools.ts',
      'export const extraTool = { name: `extra` };',
    );
    const analyzeRegistrationSource = vi.fn(() =>
      Promise.resolve({
        analysis: registrationAnalysis,
        kind: 'valid' as const,
      }),
    );
    const getEntry = vi.fn((path: string) =>
      Promise.resolve(path === '/src/tools.ts' ? { path, type: 'file' } : null),
    );
    const isSupportedAdditionalRegistration = vi.fn(() => true);
    const results = await classifyToolRelationships({
      analysis,
      analyzeSource: analyzeRegistrationSource,
      getEntry,
      hasAmbiguousCandidate: toolRelationships.hasAmbiguousCandidate,
      isSupportedAdditionalRegistration,
      registrations: [
        {
          reference: { path: '/src/declared.ts', symbol: 'declaredTool' },
          registration: 'declaredTool',
        },
      ],
      relationships: toolRelationships.relationships,
    });

    expect(results[0]?.relationship.kind).toBe('absent');
    expect(getEntry).toHaveBeenCalledTimes(2);
    expect(analyzeRegistrationSource).toHaveBeenCalledTimes(1);
    expect(isSupportedAdditionalRegistration).toHaveBeenCalledTimes(1);
  });
});
