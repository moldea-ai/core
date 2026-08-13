// runtime compatibility matrix version 1 contracts bundled with the CLI release
export type IMoldeaCliAdapterDistribution = 'private' | 'public';
export type IMoldeaCliAdapterImplementationKind = 'built-in' | 'package';
export type IMoldeaCliAdapterImplementationStatus =
  'available' | 'deprecated' | 'in-development' | 'planned';
export type IMoldeaCliBindingSupportLevel = 'full' | 'none' | 'partial';
export type IMoldeaCliBindingSubject =
  | 'runtime-agent'
  | 'input-schema'
  | 'output-schema'
  | 'instruction-loader'
  | 'variable-provider'
  | 'tool-implementation'
  | 'tool-registration'
  | 'tool-input-schema'
  | 'tool-output-schema'
  | 'skill-implementation'
  | 'skill-registration';
export type IMoldeaCliEvidenceKind =
  | 'agent-definition'
  | 'handoff-registration'
  | 'instruction-loader'
  | 'language'
  | 'runtime-package'
  | 'runtime-pattern'
  | 'schema'
  | 'skill-registration'
  | 'tool-registration'
  | 'variable-provider';
export type IMoldeaCliPackageEcosystem = 'npm' | 'other' | 'pypi';
export type IMoldeaCliPackageRole = 'companion' | 'primary';
export type IMoldeaCliPatternKind =
  | 'agent'
  | 'instruction-loader'
  | 'routing'
  | 'runtime'
  | 'schema'
  | 'skill'
  | 'tool'
  | 'variable-provider';
export type IMoldeaCliPatternSupport = 'ambiguous' | 'full' | 'partial' | 'unsupported';
export type IMoldeaCliProviderLimitKind =
  'allowed-values' | 'max-unicode-scalars' | 'max-utf8-bytes' | 'other' | 'pattern';
export type IMoldeaCliProviderLimitSubject =
  | 'agent-description'
  | 'handoff-description'
  | 'other'
  | 'schema'
  | 'skill-description'
  | 'skill-name'
  | 'tool-description'
  | 'tool-name';
export type IMoldeaCliRuntimeGuidanceExpectation = 'optional' | 'recommended' | 'required';
export type IMoldeaCliRuntimeTargetKind = 'custom' | 'package';
export type IMoldeaCliRuntimeTargetSupportLevel = 'deprecated' | 'experimental' | 'supported';

// one package version pinned into the CLI release composition
export interface IMoldeaCliBundledPackageMetadata {
  readonly name: string;
  readonly version: string;
}

// installed CLI identity expected by the generated release composition
export interface IMoldeaCliExpectedPackageMetadata extends IMoldeaCliBundledPackageMetadata {
  readonly supportedNodeRange: string;
}

// matrix identity for one adapter implementation
export interface IMoldeaCliRuntimeAdapterImplementation {
  readonly distribution: IMoldeaCliAdapterDistribution;
  readonly kind: IMoldeaCliAdapterImplementationKind;
  readonly package: string;
  readonly versionRange?: string;
}

// runtime-guidance expectation attached to a published adapter claim
export interface IMoldeaCliRuntimeGuidance {
  readonly expectation: IMoldeaCliRuntimeGuidanceExpectation;
  readonly notes?: string;
}

// one runtime package requirement published for a matrix target
export interface IMoldeaCliRuntimePackageRequirement {
  readonly ecosystem: IMoldeaCliPackageEcosystem;
  readonly name: string;
  readonly role: IMoldeaCliPackageRole;
  readonly versionRange: string;
}

// relationship and symbol support published for one binding subject
export interface IMoldeaCliBindingSupport {
  readonly relationship: IMoldeaCliBindingSupportLevel;
  readonly symbol: IMoldeaCliBindingSupportLevel;
}

// one deterministic runtime pattern claim
export interface IMoldeaCliRuntimePattern {
  readonly description: string;
  readonly id: string;
  readonly kind: IMoldeaCliPatternKind;
  readonly notes?: string;
  readonly support: IMoldeaCliPatternSupport;
}

// one provider-specific deterministic limit
export interface IMoldeaCliProviderLimit {
  readonly description: string;
  readonly id: string;
  readonly kind: IMoldeaCliProviderLimitKind;
  readonly reference?: string;
  readonly subject: IMoldeaCliProviderLimitSubject;
  readonly value: boolean | number | string | readonly string[];
}

// one verified runtime target within an adapter matrix entry
export interface IMoldeaCliRuntimeTarget {
  readonly bindingSupport?: Partial<
    Readonly<Record<IMoldeaCliBindingSubject, IMoldeaCliBindingSupport>>
  >;
  readonly evidenceKinds?: readonly IMoldeaCliEvidenceKind[];
  readonly id: string;
  readonly kind: IMoldeaCliRuntimeTargetKind;
  readonly knownLimitations?: readonly string[];
  readonly language: string;
  readonly lastVerifiedAt: string;
  readonly packages?: readonly IMoldeaCliRuntimePackageRequirement[];
  readonly patterns?: readonly IMoldeaCliRuntimePattern[];
  readonly providerLimits?: readonly IMoldeaCliProviderLimit[];
  readonly supportLevel: IMoldeaCliRuntimeTargetSupportLevel;
}

// normalized state-dependent compatibility claim for one official adapter
export interface IMoldeaCliRuntimeAdapterEntry {
  readonly compatibleCoreRange?: string;
  readonly implementation: IMoldeaCliRuntimeAdapterImplementation;
  readonly implementationStatus: IMoldeaCliAdapterImplementationStatus;
  readonly lastVerifiedAt?: string;
  readonly notes?: string;
  readonly replacement?: string;
  readonly runtimeGuidance?: IMoldeaCliRuntimeGuidance;
  readonly supportedRepositoryFormatVersions?: readonly number[];
  readonly targets?: readonly IMoldeaCliRuntimeTarget[];
}

// complete normalized compatibility matrix bundled into the CLI executable
export interface IMoldeaCliRuntimeCompatibilityMatrix {
  readonly adapters: Readonly<Record<string, IMoldeaCliRuntimeAdapterEntry>>;
  readonly version: 1;
}

// immutable release composition generated from canonical repository sources
export interface IMoldeaCliReleaseMetadata {
  readonly activeAdapterIds: readonly string[];
  readonly cliPackage: IMoldeaCliExpectedPackageMetadata;
  readonly coreRecognizedAdapterIds: readonly string[];
  readonly matrix: IMoldeaCliRuntimeCompatibilityMatrix;
  readonly minimumGitVersion: string;
  readonly outputSchemaVersion: 1;
  readonly packages: readonly IMoldeaCliBundledPackageMetadata[];
  readonly repositoryFormatVersions: readonly number[];
}
