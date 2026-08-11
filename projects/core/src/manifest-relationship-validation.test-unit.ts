// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { ICanonicalDiscoveryResult } from './canonical-discovery.js';
import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import { createCoreDiagnostic } from './diagnostic-utilities.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { CoreOperationException } from './exceptions.js';
import type { IDecisionStatus, IMoldeaManifestV1, IParsedDecision } from './format.js';
import { validateManifestRelationships } from './manifest-relationship-validation.js';

const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const PROJECT_PATH = parseRepositoryPath('/moldea/project.md');

interface IDiscoveryOverrides {
  readonly context?: readonly IRepositoryPath[];
  readonly decisions?: readonly IRepositoryPath[];
  readonly diagnostics?: readonly ICoreDiagnostic[];
  readonly project?: IRepositoryPath | null;
}

const createDiscovery = (overrides: IDiscoveryOverrides = {}): ICanonicalDiscoveryResult => ({
  diagnostics: overrides.diagnostics ?? [],
  inventory: {
    agents: [],
    context: overrides.context ?? [],
    decisions: overrides.decisions ?? [],
    manifest: MANIFEST_PATH,
    project: overrides.project === undefined ? PROJECT_PATH : overrides.project,
    runtimeGuidance: [],
  },
  valid: (overrides.diagnostics?.length ?? 0) === 0,
});

const createDecision = (
  id: string,
  slug: string,
  status: IDecisionStatus,
): Pick<IParsedDecision, 'id' | 'path' | 'status'> => ({
  id,
  path: parseRepositoryPath(`/moldea/decisions/${id}-${slug}.md`),
  status,
});

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, details, entity, path, pointer }) => ({
    code,
    details: { ...details },
    entity: entity === null ? null : { ...entity },
    path,
    pointer,
  }));
};

describe('Core manifest relationship validation', () => {
  test('accepts empty and fully resolved project, context, and decision relationships', () => {
    expect(
      validateManifestRelationships(
        MANIFEST_PATH,
        { version: 1 },
        createDiscovery(),
        [],
        DEFAULT_CORE_RESOURCE_LIMITS,
      ),
    ).toStrictEqual([]);

    const contextPath = parseRepositoryPath('/moldea/context/security.md');
    const decision = createDecision('1767225600000', 'accepted', 'accepted');
    const manifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          context: [contextPath],
          decisions: [decision.path],
          framework: { id: 'custom' },
        },
      },
      context: {
        [PROJECT_PATH]: { affectedBy: ['/src/**'] },
        [contextPath]: { affectedBy: ['/src/security/**'] },
      },
      decisions: { [decision.path]: { affectedBy: ['/src/**'] } },
      version: 1,
    };

    expect(
      validateManifestRelationships(
        MANIFEST_PATH,
        manifest,
        createDiscovery({ context: [contextPath], decisions: [decision.path] }),
        [decision],
        DEFAULT_CORE_RESOURCE_LIMITS,
      ),
    ).toStrictEqual([]);
  });

  test('reports distinct global and agent diagnostics for missing relationships', () => {
    const contextPath = parseRepositoryPath('/moldea/context/missing.md');
    const decisionPath = parseRepositoryPath('/moldea/decisions/1767225600000-missing.md');
    const manifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          context: [contextPath],
          decisions: [decisionPath],
          framework: { id: 'custom' },
        },
      },
      context: { [contextPath]: { affectedBy: ['/src/**'] } },
      decisions: { [decisionPath]: { affectedBy: ['/src/**'] } },
      version: 1,
    };
    const diagnostics = validateManifestRelationships(
      MANIFEST_PATH,
      manifest,
      createDiscovery(),
      [],
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: contextPath },
        entity: { agentId: 'reviewer' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/context',
      },
      {
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedPath: decisionPath },
        entity: { agentId: 'reviewer', decisionId: '1767225600000' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/decisions',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: contextPath },
        entity: null,
        path: MANIFEST_PATH,
        pointer: '/context/~1moldea~1context~1missing.md',
      },
      {
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedPath: decisionPath },
        entity: { decisionId: '1767225600000' },
        path: MANIFEST_PATH,
        pointer: '/decisions/~1moldea~1decisions~11767225600000-missing.md',
      },
    ]);
  });

  test.each([
    ['proposed', '1767225600000'],
    ['rejected', '1767225600001'],
    ['superseded', '1767225600002'],
  ] as const)('reports an inactive relationship to a %s decision', (status, id) => {
    const decision = createDecision(id, status, status);
    const manifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          decisions: [decision.path],
          framework: { id: 'custom' },
        },
      },
      version: 1,
    };
    const diagnostics = validateManifestRelationships(
      MANIFEST_PATH,
      manifest,
      createDiscovery({ decisions: [decision.path] }),
      [decision],
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_DECISION_RELATIONSHIP_INACTIVE',
        details: { referencedPath: decision.path, targetStatus: status },
        entity: { agentId: 'reviewer', decisionId: id },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/decisions',
      },
    ]);
  });

  test('suppresses dependent diagnostics owned by discovery or decision parsing', () => {
    const blockedContextPath = parseRepositoryPath('/moldea/context/blocked.md');
    const blockedDecisionPath = parseRepositoryPath('/moldea/decisions/1767225600000-blocked.md');
    const invalidDecisionPath = parseRepositoryPath('/moldea/decisions/1767225600001-invalid.md');
    const manifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          context: [blockedContextPath],
          decisions: [blockedDecisionPath, invalidDecisionPath],
          framework: { id: 'custom' },
        },
      },
      context: { [blockedContextPath]: { affectedBy: ['/src/**'] } },
      decisions: {
        [blockedDecisionPath]: { affectedBy: ['/src/**'] },
        [invalidDecisionPath]: { affectedBy: ['/src/**'] },
      },
      version: 1,
    };
    const discovery = createDiscovery({
      decisions: [invalidDecisionPath],
      diagnostics: [
        createCoreDiagnostic({
          code: 'MOLDEA_CANONICAL_ASSET_SYMLINK',
          path: blockedContextPath,
        }),
        createCoreDiagnostic({
          code: 'MOLDEA_CANONICAL_ASSET_SYMLINK',
          path: blockedDecisionPath,
        }),
      ],
    });

    expect(
      validateManifestRelationships(
        MANIFEST_PATH,
        manifest,
        discovery,
        [],
        DEFAULT_CORE_RESOURCE_LIMITS,
      ),
    ).toStrictEqual([]);
  });

  test('escapes mapping pointers, handles prototype-colliding agent IDs, and freezes output', () => {
    const contextPath = parseRepositoryPath('/moldea/context/a~b.md');
    const manifest: IMoldeaManifestV1 = {
      agents: {
        constructor: {
          context: [contextPath],
          framework: { id: 'custom' },
        },
      },
      context: { [contextPath]: { affectedBy: ['/src/**'] } },
      version: 1,
    };
    const diagnostics = validateManifestRelationships(
      MANIFEST_PATH,
      manifest,
      createDiscovery(),
      [],
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(diagnostics.map(({ pointer }) => pointer)).toStrictEqual([
      '/agents/constructor/context',
      '/context/~1moldea~1context~1a~0b.md',
    ]);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.details)).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.entity)).toBe(true);
  });

  test('is input-order independent across multiple agents and relationships', () => {
    const firstContextPath = parseRepositoryPath('/moldea/context/a.md');
    const secondContextPath = parseRepositoryPath('/moldea/context/b.md');
    const firstDecisionPath = parseRepositoryPath('/moldea/decisions/1767225600000-first.md');
    const secondDecisionPath = parseRepositoryPath('/moldea/decisions/1767225600001-second.md');
    const firstManifest: IMoldeaManifestV1 = {
      agents: {
        reviewer: {
          context: [secondContextPath, firstContextPath],
          decisions: [secondDecisionPath, firstDecisionPath],
          framework: { id: 'custom' },
        },
        auditor: {
          context: [secondContextPath, firstContextPath],
          decisions: [secondDecisionPath, firstDecisionPath],
          framework: { id: 'custom' },
        },
      },
      version: 1,
    };
    const reorderedManifest: IMoldeaManifestV1 = {
      agents: {
        auditor: {
          context: [firstContextPath, secondContextPath],
          decisions: [firstDecisionPath, secondDecisionPath],
          framework: { id: 'custom' },
        },
        reviewer: {
          context: [firstContextPath, secondContextPath],
          decisions: [firstDecisionPath, secondDecisionPath],
          framework: { id: 'custom' },
        },
      },
      version: 1,
    };
    const expected = validateManifestRelationships(
      MANIFEST_PATH,
      firstManifest,
      createDiscovery(),
      [],
      DEFAULT_CORE_RESOURCE_LIMITS,
    );
    const reordered = validateManifestRelationships(
      MANIFEST_PATH,
      reorderedManifest,
      createDiscovery(),
      [],
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(reordered).toStrictEqual(expected);
    expect(simplifyDiagnostics(expected)).toStrictEqual([
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: firstContextPath },
        entity: { agentId: 'auditor' },
        path: MANIFEST_PATH,
        pointer: '/agents/auditor/context',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: secondContextPath },
        entity: { agentId: 'auditor' },
        path: MANIFEST_PATH,
        pointer: '/agents/auditor/context',
      },
      {
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedPath: firstDecisionPath },
        entity: { agentId: 'auditor', decisionId: '1767225600000' },
        path: MANIFEST_PATH,
        pointer: '/agents/auditor/decisions',
      },
      {
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedPath: secondDecisionPath },
        entity: { agentId: 'auditor', decisionId: '1767225600001' },
        path: MANIFEST_PATH,
        pointer: '/agents/auditor/decisions',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: firstContextPath },
        entity: { agentId: 'reviewer' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/context',
      },
      {
        code: 'MOLDEA_REFERENCE_MISSING',
        details: { referencedPath: secondContextPath },
        entity: { agentId: 'reviewer' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/context',
      },
      {
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedPath: firstDecisionPath },
        entity: { agentId: 'reviewer', decisionId: '1767225600000' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/decisions',
      },
      {
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedPath: secondDecisionPath },
        entity: { agentId: 'reviewer', decisionId: '1767225600001' },
        path: MANIFEST_PATH,
        pointer: '/agents/reviewer/decisions',
      },
    ]);
  });

  test('attributes diagnostic budget exhaustion to repository inspection', () => {
    const manifest: IMoldeaManifestV1 = {
      context: {
        '/moldea/context/first.md': { affectedBy: ['/src/**'] },
        '/moldea/context/second.md': { affectedBy: ['/src/**'] },
      },
      version: 1,
    };

    expect(() =>
      validateManifestRelationships(MANIFEST_PATH, manifest, createDiscovery(), [], {
        ...DEFAULT_CORE_RESOURCE_LIMITS,
        maxDiagnostics: 1,
      }),
    ).toThrow(CoreOperationException);

    try {
      validateManifestRelationships(MANIFEST_PATH, manifest, createDiscovery(), [], {
        ...DEFAULT_CORE_RESOURCE_LIMITS,
        maxDiagnostics: 1,
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limit: 'maxDiagnostics',
        operation: 'inspect-project',
        retryable: false,
      });
    }
  });
});
