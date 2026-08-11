import {
  RepositorySourceException,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import { parseDecisionDocument } from '../decision/index.js';
import {
  validateDecisionGraph,
  type IDecisionGraphCandidate,
} from '../decision-graph-validation/index.js';
import { createCoreDiagnosticCollector } from '../diagnostic-utilities/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { compareExactStrings, parseDecisionIdFromPath } from '../format-validation/index.js';
import type { IParsedDecision } from '../format/index.js';
import { freezeRecursively } from '../immutable/index.js';
import type { ICoreOptionsSnapshot } from '../options/index.js';

// internal repository-level decision result retained for later project indexing
export interface IDecisionGraphResult {
  readonly valid: boolean;
  readonly decisions: readonly IParsedDecision[];
  readonly diagnostics: readonly ICoreDiagnostic[];
}

const invalidSourceData = (path: IRepositoryPath): never => {
  throw new RepositorySourceException({
    code: 'INVALID_SOURCE_DATA',
    operation: 'read-file',
    path,
    retryable: false,
  });
};

const sortDecisions = (decisions: readonly IParsedDecision[]): IParsedDecision[] => {
  return [...decisions].sort((left, right) => {
    return compareExactStrings(left.id, right.id) || compareExactStrings(left.path, right.path);
  });
};

/**
 * Reads, parses, and validates every discovered decision through one repository snapshot.
 * @param repository The coherent source-neutral repository reader.
 * @param paths The decision candidates retained by canonical discovery.
 * @param options The immutable Core limits and adapter snapshots.
 * @param signal Optional cancellation forwarded to every repository read.
 * @returns A deeply immutable internal decision set and its deterministic diagnostics.
 * @throws
 * - ENTRY_NOT_FOUND: A discovered decision disappeared from the reader snapshot.
 * - ENTRY_NOT_FILE: A discovered decision is no longer a regular file.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during decision reads.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Decision inspection or a repository operation was aborted.
 */
export const readDecisionGraph = async (
  repository: IRepositoryReader,
  paths: readonly IRepositoryPath[],
  options: ICoreOptionsSnapshot,
  signal?: AbortSignal,
): Promise<IDecisionGraphResult> => {
  const diagnostics = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  const candidates: IDecisionGraphCandidate[] = [];
  const decisions: IParsedDecision[] = [];
  const readOptions = signal === undefined ? undefined : { signal };

  for (const path of [...paths].sort(compareExactStrings)) {
    const content = await repository.readFile(path, readOptions);

    if (!(content instanceof Uint8Array)) {
      return invalidSourceData(path);
    }

    const parsed = await parseDecisionDocument(
      { content: content.slice(), path },
      options,
      'inspect-project',
    );

    for (const diagnostic of parsed.diagnostics) {
      diagnostics.add(diagnostic);
    }

    candidates.push({
      decision: parsed.decision,
      id: parseDecisionIdFromPath(path),
      path,
    });

    if (parsed.decision !== null) {
      decisions.push(parsed.decision);
    }
  }

  for (const diagnostic of validateDecisionGraph(candidates, options.limits)) {
    diagnostics.add(diagnostic);
  }

  const finalizedDiagnostics = diagnostics.finalize();

  return freezeRecursively({
    decisions: sortDecisions(decisions),
    diagnostics: finalizedDiagnostics,
    valid: finalizedDiagnostics.length === 0,
  });
};
