import type { IRepositoryReader } from '@moldea.ai/repository';

import type { IIndexedAgent, IMoldeaProjectIndex } from './contracts.js';
import type { IAdapterDiagnostic, IDiagnosticDetails } from './diagnostics.js';
import type { IRepositoryFormatVersion, IRepositoryReference } from './format.js';

// deterministic framework extension registered with one Core instance
export interface IFrameworkAdapter {
  readonly id: string;
  readonly supportedRepositoryFormatVersions: readonly IRepositoryFormatVersion[];

  /**
   * Inspects the trusted provisional project through the supplied budget-aware reader.
   * @param context The immutable project, matching agents, reader, and cancellation signal.
   * @returns A promise resolving to deterministic evidence and adapter diagnostics.
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
export type { IAdapterDiagnostic } from './diagnostics.js';
