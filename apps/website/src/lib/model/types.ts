import type {
  IRuntimeAdapterEntry,
  IRuntimeTarget,
} from '../../../../../scripts/runtime-compatibility/types.ts';

import type { IRuntimeTargetMaturity } from '../runtime-target-maturity/index.ts';

// documentation source attached to one generated package route
export interface IPackageDocument {
  description: string;
  markdown: string;
  navigationTitle: string;
  order: number;
  route: string;
  slug: string;
  sourcePath: string;
  title: string;
}

// one API symbol derived from an exported package entry point
export interface IApiSymbol {
  description: string;
  kind: string;
  name: string;
  signature: string;
}

// generated public API entry point
export interface IApiEntrypoint {
  name: string;
  route: string;
  symbols: IApiSymbol[];
}

// deterministic public project model consumed by website routes
export interface IPublicPackage {
  api: IApiEntrypoint[];
  dependencies: string[];
  dependents: string[];
  description: string;
  documents: IPackageDocument[];
  engines: Record<string, string>;
  family: 'runtime-adapters' | 'skill-core-tooling' | 'website-foundations';
  name: string;
  npmUrl: string;
  repositoryDirectory: string;
  route: string;
  slug: string;
  sourceUrl: string;
  version: string;
}

// one website target combining technical matrix data with website-owned maturity
export interface IWebsiteRuntimeTarget extends IRuntimeTarget {
  maturity: IRuntimeTargetMaturity;
}

// one website adapter entry with target maturity applied for presentation
export interface IWebsiteRuntimeAdapterEntry extends Omit<IRuntimeAdapterEntry, 'targets'> {
  targets?: IWebsiteRuntimeTarget[];
}

// one official technical adapter and its optional implemented project
export interface IAdapterPage {
  entry: IWebsiteRuntimeAdapterEntry;
  id: string;
  implementedPackageSlug: string | null;
  route: string;
}

// public search record derived from canonical website content
export interface ISearchRecord {
  description: string;
  route: string;
  searchText: string;
  title: string;
}

// deterministic website model generated exclusively from repository-owned sources
export interface IWebsiteModel {
  adapters: IAdapterPage[];
  generatedNotice: string;
  llmsText: string;
  packages: IPublicPackage[];
  routes: string[];
  searchRecords: ISearchRecord[];
}
