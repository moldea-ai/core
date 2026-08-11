// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { ICanonicalDiscoveryResult } from './canonical-discovery.js';
import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import { createCoreDiagnostic } from './diagnostic-utilities.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { CoreOperationException } from './exceptions.js';
import type { IMoldeaManifestV1, IRepositoryReference } from './format.js';
import { validateRepositoryReferences } from './repository-reference-validation.js';

const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const PROJECT_PATH = parseRepositoryPath('/moldea/project.md');
const SHARED_FILE_PATH = parseRepositoryPath('/src/shared.ts');
const EXACT_IMPACT_PATH = parseRepositoryPath('/src/exact.ts');

interface IReaderFixture {
  readonly lookups: IRepositoryPath[];
  readonly reader: IRepositoryReader;
}

const createDiscovery = (
  diagnostics: readonly ICoreDiagnostic[] = [],
): ICanonicalDiscoveryResult => ({
  diagnostics,
  inventory: {
    agents: [],
    context: [],
    decisions: [],
    manifest: MANIFEST_PATH,
    project: PROJECT_PATH,
    runtimeGuidance: [],
  },
  valid: diagnostics.length === 0,
});

const createEmptyEntryIterable = (): AsyncIterable<IRepositoryEntry> => ({
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ done: true, value: undefined }),
  }),
});

const createReaderFixture = (
  entries: ReadonlyMap<IRepositoryPath, IRepositoryEntry>,
): IReaderFixture => {
  const lookups: IRepositoryPath[] = [];

  return {
    lookups,
    reader: {
      getEntry: (path) => {
        lookups.push(path);
        return Promise.resolve(entries.get(path) ?? null);
      },
      listEntries: () => createEmptyEntryIterable(),
      readFile: () => Promise.resolve(new Uint8Array()),
    },
  };
};

const createReference = (path: IRepositoryPath): IRepositoryReference => ({ path });

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, details, entity, path, pointer }) => ({
    code,
    details: { ...details },
    entity: entity === null ? null : { ...entity },
    path,
    pointer,
  }));
};

describe('Core repository reference validation', () => {
  test('validates every repository-backed location, skips globs, and caches exact lookups', async () => {
    const sharedReference = createReference(SHARED_FILE_PATH);
    const manifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          affectedBy: ['/src/**/*.ts', EXACT_IMPACT_PATH],
          bindings: {
            inputSchema: sharedReference,
            instructionLoader: sharedReference,
            outputSchema: sharedReference,
            runtimeAgent: sharedReference,
            variableProviders: { REGION: sharedReference },
          },
          framework: { id: 'custom' },
          skills: {
            audit: {
              affectedBy: ['/skills/**', EXACT_IMPACT_PATH],
              description: 'Audits changes.',
              implementation: sharedReference,
              name: 'Audit',
              registration: sharedReference,
            },
          },
          tools: {
            deploy: {
              affectedBy: ['/tools/**', EXACT_IMPACT_PATH],
              description: 'Deploys changes.',
              implementation: sharedReference,
              inputSchema: sharedReference,
              name: 'Deploy',
              outputSchema: sharedReference,
              registration: sharedReference,
            },
          },
          unresolved: {
            verification: {
              category: 'testing',
              description: 'Verification remains incomplete.',
              effect: 'warning',
              related: [sharedReference],
              resolution: 'Complete verification.',
            },
          },
          variables: { REGION: { description: 'Deployment region.' } },
        },
      },
      context: {
        [PROJECT_PATH]: {
          affectedBy: ['/context/**', EXACT_IMPACT_PATH],
          bindings: [sharedReference],
        },
      },
      decisions: {
        '/moldea/decisions/1767225600000-adopt.md': {
          affectedBy: ['/decisions/**', EXACT_IMPACT_PATH],
          bindings: [sharedReference],
        },
      },
      unresolved: {
        architecture: {
          category: 'design',
          description: 'Architecture remains open.',
          effect: 'informational',
          related: [sharedReference],
          resolution: 'Record the decision.',
        },
      },
      version: 1,
    };
    const fixture = createReaderFixture(
      new Map([
        [SHARED_FILE_PATH, { path: SHARED_FILE_PATH, type: 'file' }],
        [EXACT_IMPACT_PATH, { path: EXACT_IMPACT_PATH, type: 'file' }],
      ]),
    );

    await expect(
      validateRepositoryReferences(
        fixture.reader,
        MANIFEST_PATH,
        manifest,
        createDiscovery(),
        DEFAULT_CORE_RESOURCE_LIMITS,
      ),
    ).resolves.toStrictEqual([]);
    expect(fixture.lookups).toStrictEqual([EXACT_IMPACT_PATH, SHARED_FILE_PATH]);
  });

  test('attributes every declaration location to its normalized pointer and entity', async () => {
    const missingReference = (path: string): IRepositoryReference => {
      return createReference(parseRepositoryPath(path));
    };
    const manifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          affectedBy: ['/impact/agent.ts'],
          bindings: {
            inputSchema: missingReference('/references/agent-input.ts'),
            instructionLoader: missingReference('/references/instruction-loader.ts'),
            outputSchema: missingReference('/references/agent-output.ts'),
            runtimeAgent: missingReference('/references/runtime-agent.ts'),
            variableProviders: {
              REGION: missingReference('/references/region-provider.ts'),
            },
          },
          framework: { id: 'custom' },
          skills: {
            audit: {
              affectedBy: ['/impact/skill.ts'],
              description: 'Audits changes.',
              implementation: missingReference('/references/skill-implementation.ts'),
              name: 'Audit',
              registration: missingReference('/references/skill-registration.ts'),
            },
          },
          tools: {
            deploy: {
              affectedBy: ['/impact/tool.ts'],
              description: 'Deploys changes.',
              implementation: missingReference('/references/tool-implementation.ts'),
              inputSchema: missingReference('/references/tool-input.ts'),
              name: 'Deploy',
              outputSchema: missingReference('/references/tool-output.ts'),
              registration: missingReference('/references/tool-registration.ts'),
            },
          },
          unresolved: {
            'agent-gap': {
              category: 'testing',
              description: 'Agent evidence is incomplete.',
              effect: 'warning',
              related: [missingReference('/references/agent-unresolved.ts')],
              resolution: 'Add agent evidence.',
            },
          },
          variables: { REGION: { description: 'Deployment region.' } },
        },
      },
      context: {
        [PROJECT_PATH]: {
          affectedBy: ['/impact/context.ts'],
          bindings: [missingReference('/references/context.ts')],
        },
      },
      decisions: {
        '/moldea/decisions/1767225600000-adopt.md': {
          affectedBy: ['/impact/decision.ts'],
          bindings: [missingReference('/references/decision.ts')],
        },
      },
      unresolved: {
        'project-gap': {
          category: 'design',
          description: 'Project evidence is incomplete.',
          effect: 'informational',
          related: [missingReference('/references/project-unresolved.ts')],
          resolution: 'Add project evidence.',
        },
      },
      version: 1,
    };
    const fixture = createReaderFixture(new Map());
    const diagnostics = await validateRepositoryReferences(
      fixture.reader,
      MANIFEST_PATH,
      manifest,
      createDiscovery(),
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(
      diagnostics.map(({ code, entity, pointer }) => ({
        code,
        entity: entity === null ? null : { ...entity },
        pointer,
      })),
    ).toStrictEqual([
      {
        code: 'MOLDEA_IMPACT_PATH_MISSING',
        entity: { agentId: 'reviewer' },
        pointer: '/agents/reviewer/affectedBy/0',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer' },
        pointer: '/agents/reviewer/bindings/inputSchema',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer' },
        pointer: '/agents/reviewer/bindings/instructionLoader',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer' },
        pointer: '/agents/reviewer/bindings/outputSchema',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer' },
        pointer: '/agents/reviewer/bindings/runtimeAgent',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer', variableId: 'REGION' },
        pointer: '/agents/reviewer/bindings/variableProviders/REGION',
      },
      {
        code: 'MOLDEA_IMPACT_PATH_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'audit', capabilityKind: 'skill' },
        pointer: '/agents/reviewer/skills/audit/affectedBy/0',
      },
      {
        code: 'MOLDEA_SKILL_IMPLEMENTATION_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'audit', capabilityKind: 'skill' },
        pointer: '/agents/reviewer/skills/audit/implementation',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'audit', capabilityKind: 'skill' },
        pointer: '/agents/reviewer/skills/audit/registration',
      },
      {
        code: 'MOLDEA_IMPACT_PATH_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'deploy', capabilityKind: 'tool' },
        pointer: '/agents/reviewer/tools/deploy/affectedBy/0',
      },
      {
        code: 'MOLDEA_TOOL_IMPLEMENTATION_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'deploy', capabilityKind: 'tool' },
        pointer: '/agents/reviewer/tools/deploy/implementation',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'deploy', capabilityKind: 'tool' },
        pointer: '/agents/reviewer/tools/deploy/inputSchema',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'deploy', capabilityKind: 'tool' },
        pointer: '/agents/reviewer/tools/deploy/outputSchema',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer', capabilityId: 'deploy', capabilityKind: 'tool' },
        pointer: '/agents/reviewer/tools/deploy/registration',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { agentId: 'reviewer' },
        pointer: '/agents/reviewer/unresolved/agent-gap/related/0',
      },
      {
        code: 'MOLDEA_IMPACT_PATH_MISSING',
        entity: null,
        pointer: '/context/~1moldea~1project.md/affectedBy/0',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: null,
        pointer: '/context/~1moldea~1project.md/bindings/0',
      },
      {
        code: 'MOLDEA_IMPACT_PATH_MISSING',
        entity: { decisionId: '1767225600000' },
        pointer: '/decisions/~1moldea~1decisions~11767225600000-adopt.md/affectedBy/0',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: { decisionId: '1767225600000' },
        pointer: '/decisions/~1moldea~1decisions~11767225600000-adopt.md/bindings/0',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        entity: null,
        pointer: '/unresolved/project-gap/related/0',
      },
    ]);
    expect(fixture.lookups).toHaveLength(20);
  });

  test('emits deterministic type-specific diagnostics at normalized pointers', async () => {
    const directoryReferencePath = parseRepositoryPath('/src/a-directory');
    const missingReferencePath = parseRepositoryPath('/src/b-missing.ts');
    const symlinkReferencePath = parseRepositoryPath('/src/c-link.ts');
    const missingImpactPath = parseRepositoryPath('/impact/a-missing.ts');
    const directoryImpactPath = parseRepositoryPath('/impact/b-directory');
    const symlinkImpactPath = parseRepositoryPath('/impact/c-link.ts');
    const missingToolPath = parseRepositoryPath('/tools/missing.ts');
    const directoryToolPath = parseRepositoryPath('/tools/directory');
    const symlinkSkillPath = parseRepositoryPath('/skills/link.ts');
    const manifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          framework: { id: 'custom' },
          skills: {
            audit: {
              description: 'Audits changes.',
              implementation: createReference(symlinkSkillPath),
              name: 'Audit',
            },
          },
          tools: {
            deploy: {
              description: 'Deploys changes.',
              implementation: createReference(missingToolPath),
              name: 'Deploy',
            },
            generate: {
              description: 'Generates changes.',
              implementation: createReference(directoryToolPath),
              name: 'Generate',
            },
          },
        },
      },
      context: {
        [PROJECT_PATH]: {
          affectedBy: [symlinkImpactPath, directoryImpactPath, missingImpactPath],
          bindings: [
            createReference(symlinkReferencePath),
            createReference(missingReferencePath),
            createReference(directoryReferencePath),
          ],
        },
      },
      version: 1,
    };
    const fixture = createReaderFixture(
      new Map([
        [directoryReferencePath, { path: directoryReferencePath, type: 'directory' }],
        [symlinkReferencePath, { path: symlinkReferencePath, type: 'symlink' }],
        [directoryImpactPath, { path: directoryImpactPath, type: 'directory' }],
        [symlinkImpactPath, { path: symlinkImpactPath, type: 'symlink' }],
        [directoryToolPath, { path: directoryToolPath, type: 'directory' }],
        [symlinkSkillPath, { path: symlinkSkillPath, type: 'symlink' }],
      ]),
    );
    const diagnostics = await validateRepositoryReferences(
      fixture.reader,
      MANIFEST_PATH,
      manifest,
      createDiscovery(),
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_SKILL_IMPLEMENTATION_MISSING',
        details: {
          actualType: 'symlink',
          reason: 'symlink',
          referencedPath: symlinkSkillPath,
        },
        entity: { agentId: 'reviewer', capabilityId: 'audit', capabilityKind: 'skill' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/skills/audit/implementation',
      },
      {
        code: 'MOLDEA_TOOL_IMPLEMENTATION_MISSING',
        details: { reason: 'missing', referencedPath: missingToolPath },
        entity: { agentId: 'reviewer', capabilityId: 'deploy', capabilityKind: 'tool' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/tools/deploy/implementation',
      },
      {
        code: 'MOLDEA_TOOL_IMPLEMENTATION_MISSING',
        details: {
          actualType: 'directory',
          reason: 'not-file',
          referencedPath: directoryToolPath,
        },
        entity: { agentId: 'reviewer', capabilityId: 'generate', capabilityKind: 'tool' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/tools/generate/implementation',
      },
      {
        code: 'MOLDEA_IMPACT_PATH_MISSING',
        details: { impactPath: missingImpactPath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1project.md/affectedBy/0',
      },
      {
        code: 'MOLDEA_IMPACT_PATH_NOT_FILE',
        details: { actualType: 'directory', impactPath: directoryImpactPath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1project.md/affectedBy/1',
      },
      {
        code: 'MOLDEA_IMPACT_PATH_NOT_FILE',
        details: { actualType: 'symlink', impactPath: symlinkImpactPath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1project.md/affectedBy/2',
      },
      {
        code: 'MOLDEA_REFERENCE_NOT_FILE',
        details: { actualType: 'directory', referencedPath: directoryReferencePath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1project.md/bindings/0',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: missingReferencePath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1project.md/bindings/1',
      },
      {
        code: 'MOLDEA_REFERENCE_SYMLINK',
        details: { actualType: 'symlink', referencedPath: symlinkReferencePath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1project.md/bindings/2',
      },
    ]);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.details)).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.entity)).toBe(true);
  });

  test('suppresses descendants of discovery-owned invalid paths', async () => {
    const blockedPath = parseRepositoryPath('/blocked');
    const blockedReferencePath = parseRepositoryPath('/blocked/child.ts');
    const missingReferencePath = parseRepositoryPath('/available/missing.ts');
    const discovery = createDiscovery([
      createCoreDiagnostic({
        code: 'MOLDEA_CANONICAL_ASSET_SYMLINK',
        path: blockedPath,
      }),
    ]);
    const fixture = createReaderFixture(new Map());
    const diagnostics = await validateRepositoryReferences(
      fixture.reader,
      MANIFEST_PATH,
      {
        context: {
          [PROJECT_PATH]: {
            bindings: [
              createReference(blockedReferencePath),
              createReference(missingReferencePath),
            ],
          },
        },
        version: 1,
      },
      discovery,
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: missingReferencePath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1project.md/bindings/0',
      },
    ]);
    expect(fixture.lookups).toStrictEqual([missingReferencePath]);
  });

  test('forwards cancellation and preserves repository exceptions unchanged', async () => {
    const sourceError = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'get-entry',
      path: SHARED_FILE_PATH,
      retryable: true,
    });
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const repository: IRepositoryReader = {
      getEntry: (_path, options) => {
        receivedSignal = options?.signal;
        return Promise.reject(sourceError);
      },
      listEntries: () => createEmptyEntryIterable(),
      readFile: () => Promise.resolve(new Uint8Array()),
    };
    const validation = validateRepositoryReferences(
      repository,
      MANIFEST_PATH,
      {
        context: { [PROJECT_PATH]: { bindings: [createReference(SHARED_FILE_PATH)] } },
        version: 1,
      },
      createDiscovery(),
      DEFAULT_CORE_RESOURCE_LIMITS,
      controller.signal,
    );

    await expect(validation).rejects.toBe(sourceError);
    expect(receivedSignal).toBe(controller.signal);
  });

  test('attributes diagnostic budget exhaustion to repository inspection', async () => {
    const firstMissingPath = parseRepositoryPath('/src/first.ts');
    const secondMissingPath = parseRepositoryPath('/src/second.ts');
    const fixture = createReaderFixture(new Map());
    const validation = validateRepositoryReferences(
      fixture.reader,
      MANIFEST_PATH,
      {
        context: {
          [PROJECT_PATH]: {
            bindings: [createReference(firstMissingPath), createReference(secondMissingPath)],
          },
        },
        version: 1,
      },
      createDiscovery(),
      { ...DEFAULT_CORE_RESOURCE_LIMITS, maxDiagnostics: 1 },
    );

    await expect(validation).rejects.toBeInstanceOf(CoreOperationException);
    await expect(validation).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'inspect-project',
      retryable: false,
    });
  });
});
