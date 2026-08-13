import { collapseGitInventoryCandidates } from './candidate-collapser.js';
import { inspectGitInventoryEntry } from './entry-inspector.js';
import { resolveGitSymlinkConfiguration } from './symlink-configuration.js';
import type {
  ICollapsedGitTrackedInventoryCandidate,
  IGitInventoryEntry,
  IGitInventoryEntryInspector,
  IGitInventoryEntryTypeNormalizationFailedResult,
  IGitInventoryEntryTypeNormalizationResult,
  IGitInventoryEntryTypeNormalizer,
  IGitSymlinkConfigurationResolver,
} from './types.js';

/** Creates one immutable entry-type normalization failure. */
const createNormalizationFailure = (
  errorCode: IGitInventoryEntryTypeNormalizationFailedResult['errorCode'],
): IGitInventoryEntryTypeNormalizationFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Determines whether retained index metadata contains a Git symlink mode. */
const hasSymlinkMode = (candidate: ICollapsedGitTrackedInventoryCandidate): boolean =>
  candidate.indexEntries.some(({ mode }) => mode === '120000');

/** Determines whether retained index metadata contains a Git regular-file mode. */
const hasRegularFileMode = (candidate: ICollapsedGitTrackedInventoryCandidate): boolean =>
  candidate.indexEntries.some(({ mode }) => mode === '100644' || mode === '100755');

/**
 * Creates entry-type normalization around injectable filesystem and Git configuration boundaries.
 * @param entryInspector The no-follow current host entry inspector.
 * @param symlinkConfigurationResolver The bounded effective core.symlinks resolver.
 * @returns An all-or-nothing effective working-tree entry normalizer.
 */
export const createGitInventoryEntryTypeNormalizer = (
  entryInspector: IGitInventoryEntryInspector = inspectGitInventoryEntry,
  symlinkConfigurationResolver: IGitSymlinkConfigurationResolver = resolveGitSymlinkConfiguration,
): IGitInventoryEntryTypeNormalizer => {
  return async (input): Promise<IGitInventoryEntryTypeNormalizationResult> => {
    if (!Number.isSafeInteger(input.maxMetadataBytes) || input.maxMetadataBytes < 0) {
      return createNormalizationFailure('RESOURCE_LIMIT_EXCEEDED');
    }

    const collapseResult = collapseGitInventoryCandidates(input.candidates);

    if (collapseResult.kind === 'failed') {
      return createNormalizationFailure('GIT_OUTPUT_INVALID');
    }

    const entries: IGitInventoryEntry[] = [];
    let symlinkConfiguration: Awaited<ReturnType<IGitSymlinkConfigurationResolver>> | null = null;

    for (const candidate of collapseResult.candidates) {
      const inspectionResult = await entryInspector(input.repositoryRoot, candidate.path);

      if (inspectionResult.kind === 'failed') {
        return inspectionResult;
      }

      if (inspectionResult.kind === 'missing') {
        continue;
      }

      if (inspectionResult.entryType === 'unsupported') {
        return createNormalizationFailure('GIT_OUTPUT_INVALID');
      }

      if (candidate.kind === 'untracked') {
        entries.push(
          Object.freeze({
            entryType: inspectionResult.entryType,
            kind: 'untracked',
            path: candidate.path,
            requiresSymlinkOverlay: false,
          }),
        );
        continue;
      }

      if (inspectionResult.entryType === 'symlink' || !hasSymlinkMode(candidate)) {
        entries.push(
          Object.freeze({
            entryType: inspectionResult.entryType,
            indexEntries: candidate.indexEntries,
            kind: 'tracked',
            path: candidate.path,
            requiresSymlinkOverlay: false,
          }),
        );
        continue;
      }

      symlinkConfiguration ??= await symlinkConfigurationResolver({
        maxMetadataBytes: input.maxMetadataBytes,
        repositoryRoot: input.repositoryRoot,
      });

      if (symlinkConfiguration.kind === 'failed') {
        return symlinkConfiguration;
      }

      if (
        !Number.isSafeInteger(symlinkConfiguration.gitMetadataBytes) ||
        symlinkConfiguration.gitMetadataBytes < 0 ||
        symlinkConfiguration.gitMetadataBytes > input.maxMetadataBytes
      ) {
        return createNormalizationFailure('GIT_OUTPUT_INVALID');
      }

      if (!symlinkConfiguration.isEnabled && hasRegularFileMode(candidate)) {
        return createNormalizationFailure('GIT_OUTPUT_INVALID');
      }

      const requiresSymlinkOverlay = !symlinkConfiguration.isEnabled;

      entries.push(
        Object.freeze({
          entryType: requiresSymlinkOverlay ? 'symlink' : 'file',
          indexEntries: candidate.indexEntries,
          kind: 'tracked',
          path: candidate.path,
          requiresSymlinkOverlay,
        }),
      );
    }

    return Object.freeze({
      entries: Object.freeze(entries),
      gitMetadataBytes:
        symlinkConfiguration?.kind === 'resolved' ? symlinkConfiguration.gitMetadataBytes : 0,
      kind: 'normalized',
    });
  };
};

// default effective working-tree entry-type normalizer
export const normalizeGitInventoryEntryTypes = createGitInventoryEntryTypeNormalizer();
