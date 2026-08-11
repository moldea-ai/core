import type { IRepositoryReader } from '@moldea.ai/repository';

import type { IIndexedAgent, IMoldeaProjectIndex } from '../contracts/index.js';
import type { IAdapterDiagnostic, IDiagnosticDetails } from '../diagnostics/index.js';
import type { IRepositoryFormatVersion, IRepositoryReference } from '../format/index.js';

// deterministic framework extension registered with one Core instance
export interface IFrameworkAdapter {
  readonly id: string;
  readonly supportedRepositoryFormatVersions: readonly IRepositoryFormatVersion[];

  /**
   * Inspects the trusted provisional project through the supplied budget-aware reader.
   * @param context The immutable project, matching agents, reader, and cancellation signal.
   * @returns A promise resolving to deterministic evidence and adapter diagnostics.
   * @throws
   * - INVALID_REPOSITORY_PATH: An adapter repository path is invalid.
   * - ENTRY_NOT_FOUND: A requested repository entry is absent.
   * - ENTRY_NOT_FILE: A requested repository entry is not a regular file.
   * - ENTRY_NOT_DIRECTORY: A requested repository entry is not a directory.
   * - ACCESS_DENIED: Access to the repository source was denied.
   * - SOURCE_UNAVAILABLE: The repository source is unavailable.
   * - SNAPSHOT_CHANGED: The repository snapshot changed during inspection.
   * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
   * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
   * - ABORTED: Adapter inspection or a repository operation was aborted.
   */
  inspect(context: IFrameworkAdapterContext): Promise<IFrameworkAdapterResult>;
}

// immutable invocation context supplied only after universal validation succeeds
export interface IFrameworkAdapterContext {
  readonly repository: IRepositoryReader;
  readonly project: IMoldeaProjectIndex;
  readonly agents: readonly IIndexedAgent[];
  readonly signal?: AbortSignal;
}

// normalized framework observation kinds and evidence records
export type IFrameworkAdapterEvidenceKind =
  | 'framework-package'
  | 'language'
  | 'agent-definition'
  | 'instruction-loader'
  | 'schema'
  | 'tool-registration'
  | 'skill-registration'
  | 'handoff-registration'
  | 'variable-provider'
  | 'runtime-pattern';

export interface IFrameworkAdapterEvidence {
  readonly source: string;
  readonly kind: IFrameworkAdapterEvidenceKind;
  readonly agentId: string | null;
  readonly capabilityKind: 'tool' | 'skill' | null;
  readonly capabilityId: string | null;
  readonly runtimeName: string | null;
  readonly references: readonly IRepositoryReference[];
  readonly details: IDiagnosticDetails;
}

// complete all-or-nothing output from one adapter invocation
export interface IFrameworkAdapterResult {
  readonly evidence: readonly IFrameworkAdapterEvidence[];
  readonly diagnostics: readonly IAdapterDiagnostic[];
}

// adapter diagnostic contract
export type { IAdapterDiagnostic } from '../diagnostics/index.js';
