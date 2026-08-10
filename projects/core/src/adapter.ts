import type { IRepositoryReader } from '@moldea.ai/repository';

import type { IIndexedAgent, IMoldeaProjectIndex } from './contracts.js';
import type { IAdapterDiagnostic, IDiagnosticDetails } from './diagnostics.js';
import type { IRepositoryFormatVersion, IRepositoryReference } from './format.js';

export interface IFrameworkAdapter {
  readonly id: string;
  readonly supportedRepositoryFormatVersions: readonly IRepositoryFormatVersion[];

  inspect(context: IFrameworkAdapterContext): Promise<IFrameworkAdapterResult>;
}

export interface IFrameworkAdapterContext {
  readonly repository: IRepositoryReader;
  readonly project: IMoldeaProjectIndex;
  readonly agents: readonly IIndexedAgent[];
  readonly signal?: AbortSignal;
}

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

export interface IFrameworkAdapterResult {
  readonly evidence: readonly IFrameworkAdapterEvidence[];
  readonly diagnostics: readonly IAdapterDiagnostic[];
}

export type { IAdapterDiagnostic } from './diagnostics.js';
