// runtime compatibility matrix version 1 contracts
export type IAdapterDistribution = 'private' | 'public';
export type IAdapterImplementationKind = 'built-in' | 'package';
export type IAdapterImplementationStatus =
  'available' | 'deprecated' | 'in-development' | 'planned';
export type IBindingSupportLevel = 'full' | 'none' | 'partial';
export type IBindingSubject =
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
export type IEvidenceKind =
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
export type IPackageEcosystem = 'npm' | 'other' | 'pypi';
export type IPackageRole = 'companion' | 'primary';
export type IPatternKind =
  | 'agent'
  | 'instruction-loader'
  | 'routing'
  | 'runtime'
  | 'schema'
  | 'skill'
  | 'tool'
  | 'variable-provider';
export type IPatternSupport = 'ambiguous' | 'full' | 'partial' | 'unsupported';
export type IProviderLimitKind =
  'allowed-values' | 'max-unicode-scalars' | 'max-utf8-bytes' | 'other' | 'pattern';
export type IProviderLimitSubject =
  | 'agent-description'
  | 'handoff-description'
  | 'other'
  | 'schema'
  | 'skill-description'
  | 'skill-name'
  | 'tool-description'
  | 'tool-name';
export type IRuntimeGuidanceExpectation = 'optional' | 'recommended' | 'required';
export type IRuntimeTargetKind = 'custom' | 'package';
export type IRuntimeTargetSupportLevel = 'deprecated' | 'experimental' | 'supported';

export interface IRuntimeAdapterImplementation {
  distribution: IAdapterDistribution;
  kind: IAdapterImplementationKind;
  package: string;
  versionRange?: string;
}

export interface IRuntimeGuidance {
  expectation: IRuntimeGuidanceExpectation;
  notes?: string;
}

export interface IPackageRequirement {
  ecosystem: IPackageEcosystem;
  name: string;
  role: IPackageRole;
  versionRange: string;
}

export interface IBindingSupport {
  relationship: IBindingSupportLevel;
  symbol: IBindingSupportLevel;
}

export interface IRuntimePattern {
  description: string;
  id: string;
  kind: IPatternKind;
  notes?: string;
  support: IPatternSupport;
}

export interface IProviderLimit {
  description: string;
  id: string;
  kind: IProviderLimitKind;
  reference?: string;
  subject: IProviderLimitSubject;
  value: boolean | number | string | string[];
}

export interface IRuntimeTarget {
  bindingSupport?: Partial<Record<IBindingSubject, IBindingSupport>>;
  evidenceKinds?: IEvidenceKind[];
  id: string;
  kind: IRuntimeTargetKind;
  knownLimitations?: string[];
  language: string;
  lastVerifiedAt: string;
  packages?: IPackageRequirement[];
  patterns?: IRuntimePattern[];
  providerLimits?: IProviderLimit[];
  supportLevel: IRuntimeTargetSupportLevel;
}

export interface IRuntimeAdapterEntry {
  compatibleCoreRange?: string;
  implementation: IRuntimeAdapterImplementation;
  implementationStatus: IAdapterImplementationStatus;
  lastVerifiedAt?: string;
  notes?: string;
  replacement?: string;
  runtimeGuidance?: IRuntimeGuidance;
  supportedRepositoryFormatVersions?: number[];
  targets?: IRuntimeTarget[];
}

export interface IRuntimeCompatibilityMatrix {
  adapters: Record<string, IRuntimeAdapterEntry>;
  version: 1;
}

// structured validator failure with a canonical matrix path
export interface IRuntimeCompatibilityValidationIssue {
  message: string;
  path: string;
}

// result returned by strict matrix parsing and normalization
export type IRuntimeCompatibilityValidationResult =
  | {
      issues: IRuntimeCompatibilityValidationIssue[];
      valid: false;
    }
  | {
      matrix: IRuntimeCompatibilityMatrix;
      valid: true;
    };
