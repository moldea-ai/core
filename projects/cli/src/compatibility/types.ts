import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import type { IMoldeaCliPackageMetadata } from '../package-metadata/index.js';
import type {
  IMoldeaCliReleaseMetadata,
  IMoldeaCliRuntimeAdapterEntry,
} from '../release-metadata/index.js';

// one exact package version reported by the compatibility command
export interface IMoldeaCliPackageCompatibility {
  readonly name: string;
  readonly version: string;
}

// one adapter composition reported with its exact bundled matrix entry
export interface IMoldeaCliAdapterCompatibility {
  readonly active: boolean;
  readonly bundledVersion: string | null;
  readonly id: string;
  readonly matrix: IMoldeaCliRuntimeAdapterEntry;
}

// complete version 1 compatibility command result
export interface IMoldeaCliCompatibilityResult {
  readonly adapters: readonly IMoldeaCliAdapterCompatibility[];
  readonly matrixVersion: number;
  readonly minimumGitVersion: string;
  readonly outputSchemaVersion: 1;
  readonly packages: readonly IMoldeaCliPackageCompatibility[];
  readonly repositoryFormatVersions: readonly number[];
  readonly supportedNodeRange: string;
}

// runtime and generated state compared before any command produces a result
export interface IMoldeaCliCompatibilityStateInput {
  readonly activeAdapters: readonly IRuntimeAdapter[];
  readonly coreRecognizedAdapterIds: readonly string[];
  readonly coreSupportedRepositoryFormatVersions: readonly number[];
  readonly minimumGitVersion: string;
  readonly outputSchemaVersion: 1;
  readonly packageMetadata: IMoldeaCliPackageMetadata;
  readonly releaseMetadata: IMoldeaCliReleaseMetadata;
}

// installed inputs resolved through the executable's fixed runtime composition
export interface IMoldeaCliInstalledCompatibilityInput {
  readonly packageMetadata: IMoldeaCliPackageMetadata;
  readonly releaseMetadata: IMoldeaCliReleaseMetadata;
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
