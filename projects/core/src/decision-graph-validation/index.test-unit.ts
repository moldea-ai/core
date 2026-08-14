// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from '../constants/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { CoreOperationException } from '../exceptions/index.js';
import type { IDecisionStatus } from '../format/index.js';

import {
  validateDecisionGraph,
  type IDecisionGraphCandidate,
  type IDecisionGraphNode,
} from './index.js';

const createCandidate = (
  id: string,
  slug: string,
  status: IDecisionStatus,
  supersedes: readonly string[] = [],
): IDecisionGraphCandidate => {
  const path = parseRepositoryPath(`/moldea/decisions/${id}-${slug}.md`);
  const decision: IDecisionGraphNode = { id, path, status, supersedes };

  return { decision, id, path };
};

const createInvalidCandidate = (id: string, slug: string): IDecisionGraphCandidate => ({
  decision: null,
  id,
  path: parseRepositoryPath(`/moldea/decisions/${id}-${slug}.md`),
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

describe('Core decision graph validation', () => {
  test('accepts an empty graph and a complete active supersession chain', () => {
    expect(validateDecisionGraph([], DEFAULT_CORE_RESOURCE_LIMITS)).toStrictEqual([]);

    const oldest = createCandidate('1767225600000', 'oldest', 'superseded');
    const middle = createCandidate('1767225600001', 'middle', 'superseded', [oldest.id ?? '']);
    const newest = createCandidate('1767225600002', 'newest', 'accepted', [middle.id ?? '']);

    expect(
      validateDecisionGraph([newest, oldest, middle], DEFAULT_CORE_RESOURCE_LIMITS),
    ).toStrictEqual([]);
  });

  test('reports every duplicate decision path and excludes its ambiguous edges', () => {
    const duplicateId = '1767225600000';
    const first = createCandidate(duplicateId, 'first', 'accepted', ['1767225600001']);
    const second = createCandidate(duplicateId, 'second', 'accepted', ['1767225600002']);
    const diagnostics = validateDecisionGraph([second, first], DEFAULT_CORE_RESOURCE_LIMITS);

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_DECISION_ID_DUPLICATE',
        details: { occurrences: 2 },
        entity: { decisionId: duplicateId },
        path: first.path,
        pointer: null,
      },
      {
        code: 'MOLDEA_DECISION_ID_DUPLICATE',
        details: { occurrences: 2 },
        entity: { decisionId: duplicateId },
        path: second.path,
        pointer: null,
      },
    ]);
  });

  test('reports missing references only when no canonical candidate owns the ID', () => {
    const missingId = '1767225600001';
    const source = createCandidate('1767225600002', 'source', 'accepted', [missingId]);
    const diagnostics = validateDecisionGraph([source], DEFAULT_CORE_RESOURCE_LIMITS);

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_DECISION_REFERENCE_MISSING',
        details: { referencedDecisionId: missingId },
        entity: { decisionId: source.id },
        path: source.path,
        pointer: '/supersedes',
      },
    ]);

    expect(
      validateDecisionGraph(
        [source, createInvalidCandidate(missingId, 'invalid-target')],
        DEFAULT_CORE_RESOURCE_LIMITS,
      ),
    ).toStrictEqual([]);
  });

  test('reports one deterministic cycle diagnostic for every component member', () => {
    const first = createCandidate('1767225600000', 'first', 'proposed', ['1767225600001']);
    const second = createCandidate('1767225600001', 'second', 'rejected', ['1767225600002']);
    const third = createCandidate('1767225600002', 'third', 'proposed', ['1767225600000']);
    const diagnostics = validateDecisionGraph([third, first, second], DEFAULT_CORE_RESOURCE_LIMITS);

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual(
      [first, second, third].map((candidate) => ({
        code: 'MOLDEA_DECISION_SUPERSESSION_CYCLE',
        details: {
          cycleRepresentativeDecisionId: '1767225600000',
          cycleSize: 3,
        },
        entity: { decisionId: candidate.id },
        path: candidate.path,
        pointer: '/supersedes',
      })),
    );
  });

  test('keeps diagnostic details constant-sized for a large cycle', () => {
    const cycleSize = 1_024;
    const ids = Array.from({ length: cycleSize }, (_, index) => String(1_767_225_600_000 + index));
    const candidates = ids.map((id, index) =>
      createCandidate(id, `decision-${index}`, 'proposed', [ids[(index + 1) % cycleSize] ?? '']),
    );
    const diagnostics = validateDecisionGraph(candidates, {
      ...DEFAULT_CORE_RESOURCE_LIMITS,
      maxDiagnostics: 2_048,
    });

    expect(diagnostics).toHaveLength(cycleSize);

    for (const diagnostic of diagnostics) {
      expect({ ...diagnostic.details }).toStrictEqual({
        cycleRepresentativeDecisionId: ids[0],
        cycleSize,
      });
    }
  });

  test('enforces active-source statuses and active incoming supersession', () => {
    const acceptedTarget = createCandidate('1767225600000', 'accepted-target', 'accepted');
    const invalidSource = createCandidate('1767225600001', 'invalid-source', 'accepted', [
      acceptedTarget.id ?? '',
    ]);
    const orphan = createCandidate('1767225600002', 'orphan', 'superseded');
    const proposed = createCandidate('1767225600003', 'proposed', 'proposed', [orphan.id ?? '']);
    const rejected = createCandidate('1767225600004', 'rejected', 'rejected', [orphan.id ?? '']);
    const diagnostics = validateDecisionGraph(
      [rejected, orphan, invalidSource, acceptedTarget, proposed],
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual([
      {
        code: 'MOLDEA_DECISION_SUPERSESSION_STATUS_INVALID',
        details: {
          referencedDecisionId: acceptedTarget.id,
          sourceStatus: 'accepted',
          targetStatus: 'accepted',
        },
        entity: { decisionId: invalidSource.id },
        path: invalidSource.path,
        pointer: '/supersedes',
      },
      {
        code: 'MOLDEA_DECISION_SUPERSEDED_ORPHAN',
        details: {},
        entity: { decisionId: orphan.id },
        path: orphan.path,
        pointer: null,
      },
    ]);
  });

  test('is input-order independent and deeply freezes diagnostics', () => {
    const first = createCandidate('1767225600000', 'first', 'superseded', ['1767225600001']);
    const second = createCandidate('1767225600001', 'second', 'superseded', ['1767225600000']);
    const expected = validateDecisionGraph([first, second], DEFAULT_CORE_RESOURCE_LIMITS);
    const reordered = validateDecisionGraph([second, first], DEFAULT_CORE_RESOURCE_LIMITS);

    expect(reordered).toStrictEqual(expected);
    expect(Object.isFrozen(reordered)).toBe(true);
    expect(Object.isFrozen(reordered[0])).toBe(true);
    expect(Object.isFrozen(reordered[0]?.details)).toBe(true);
    expect(Object.isFrozen(reordered[0]?.entity)).toBe(true);
  });

  test('uses the repository-inspection operation when the diagnostic budget is exhausted', () => {
    const first = createCandidate('1767225600000', 'first', 'accepted');
    const second = createCandidate('1767225600000', 'second', 'accepted');

    expect(() =>
      validateDecisionGraph([first, second], {
        ...DEFAULT_CORE_RESOURCE_LIMITS,
        maxDiagnostics: 1,
      }),
    ).toThrow(CoreOperationException);

    try {
      validateDecisionGraph([first, second], {
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
