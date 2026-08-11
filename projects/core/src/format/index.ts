import type { IRepositoryPath } from '@moldea.ai/repository';

import type { IIndexedTextAsset } from '../contracts/index.js';

// supported repository-format major version and exact repository reference
export type IRepositoryFormatVersion = 1;

export interface IRepositoryReference {
  readonly path: IRepositoryPath;
  readonly symbol?: string;
}

// context, decision, framework, and runtime-variable manifest declarations
export interface IRelationshipManifestEntry {
  readonly bindings?: readonly IRepositoryReference[];
  readonly affectedBy?: readonly string[];
}

export interface IFrameworkManifestEntry {
  readonly id: string;
  readonly guidance?: IRepositoryPath;
}

export interface IRuntimeVariableManifestEntry {
  readonly description: string;
}

// agent binding and capability declarations
export interface IAgentBindingsManifestEntry {
  readonly runtimeAgent?: IRepositoryReference;
  readonly inputSchema?: IRepositoryReference;
  readonly outputSchema?: IRepositoryReference;
  readonly instructionLoader?: IRepositoryReference;
  readonly variableProviders?: Readonly<Record<string, IRepositoryReference>>;
}

export interface IToolManifestEntry {
  readonly name: string;
  readonly description: string;
  readonly implementation: IRepositoryReference;
  readonly registration?: IRepositoryReference;
  readonly inputSchema?: IRepositoryReference;
  readonly outputSchema?: IRepositoryReference;
  readonly affectedBy?: readonly string[];
}

export interface ISkillManifestEntry {
  readonly name: string;
  readonly description: string;
  readonly implementation: IRepositoryReference;
  readonly registration?: IRepositoryReference;
  readonly affectedBy?: readonly string[];
}

// unresolved requirement and complete agent declarations
export type IUnresolvedRequirementEffect = 'blocking' | 'warning' | 'informational';

export interface IUnresolvedRequirementManifestEntry {
  readonly category: string;
  readonly effect: IUnresolvedRequirementEffect;
  readonly description: string;
  readonly resolution: string;
  readonly related?: readonly IRepositoryReference[];
  readonly reference?: string;
}

export interface IAgentManifestEntry {
  readonly framework: IFrameworkManifestEntry;
  readonly context?: readonly IRepositoryPath[];
  readonly decisions?: readonly IRepositoryPath[];
  readonly variables?: Readonly<Record<string, IRuntimeVariableManifestEntry>>;
  readonly bindings?: IAgentBindingsManifestEntry;
  readonly tools?: Readonly<Record<string, IToolManifestEntry>>;
  readonly skills?: Readonly<Record<string, ISkillManifestEntry>>;
  readonly affectedBy?: readonly string[];
  readonly mirrors?: readonly IRepositoryPath[];
  readonly unresolved?: Readonly<Record<string, IUnresolvedRequirementManifestEntry>>;
}

// normalized repository-format version 1 manifest
export interface IMoldeaManifestV1 {
  readonly version: 1;
  readonly context?: Readonly<Record<string, IRelationshipManifestEntry>>;
  readonly decisions?: Readonly<Record<string, IRelationshipManifestEntry>>;
  readonly unresolved?: Readonly<Record<string, IUnresolvedRequirementManifestEntry>>;
  readonly agents?: Readonly<Record<string, IAgentManifestEntry>>;
}

// parsed decision status and immutable document model
export type IDecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded';

export interface IParsedDecision {
  readonly id: string;
  readonly path: IRepositoryPath;
  readonly status: IDecisionStatus;
  readonly createdAt: string;
  readonly supersedes: readonly string[];
  readonly body: string;
  readonly asset: IIndexedTextAsset;
}
