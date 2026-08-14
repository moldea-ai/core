// installed package composition required by version output and runtime integrity checks
export interface IMoldeaCliPackageMetadata {
  readonly dependencies: Readonly<Record<string, string>> | null;
  readonly installedPackageVersions: Readonly<Record<string, string>> | null;
  readonly supportedNodeRange: string | null;
  readonly version: string;
}

// injectable package-entry resolution boundary used by installed-package tests
export type IMoldeaCliPackageEntryResolver = (packageName: string) => string;
