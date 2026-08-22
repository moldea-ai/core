import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import type { IMoldeaCliPackageMetadata } from '../package-metadata/index.js';

// one exact installed package version reported by the compatibility command
export interface IMoldeaCliPackageCompatibility {
  readonly name: string;
  readonly version: string;
}

// one executable adapter and the repository formats accepted by its implementation
export interface IMoldeaCliAdapterCompatibility {
  readonly id: string;
  readonly repositoryFormatVersions: readonly number[];
}

// compact technical compatibility state derived by the installed CLI
export interface IMoldeaCliCompatibilityResult {
  readonly adapters: readonly IMoldeaCliAdapterCompatibility[];
  readonly minimumGitVersion: string;
  readonly packages: readonly IMoldeaCliPackageCompatibility[];
  readonly repositoryFormatVersions: readonly number[];
  readonly supportedNodeRange: string;
}

// actual runtime and package state checked before any command produces a result
export interface IMoldeaCliCompatibilityStateInput {
  readonly activeAdapters: readonly IRuntimeAdapter[];
  readonly coreSupportedRepositoryFormatVersions: readonly number[];
  readonly minimumGitVersion: string;
  readonly outputSchemaVersion: 2;
  readonly packageMetadata: IMoldeaCliPackageMetadata;
}

// installed input resolved through the executable's fixed runtime composition
export interface IMoldeaCliInstalledCompatibilityInput {
  readonly packageMetadata: IMoldeaCliPackageMetadata;
}

// all-or-nothing runtime compatibility resolution
export type IMoldeaCliCompatibilityResolution =
  | {
      readonly kind: 'invalid';
    }
  | {
      readonly kind: 'valid';
      readonly result: IMoldeaCliCompatibilityResult;
    };

// injectable installed compatibility boundary used by command execution
export type IMoldeaCliCompatibilityResolver = (
  input: IMoldeaCliInstalledCompatibilityInput,
) => IMoldeaCliCompatibilityResolution;
