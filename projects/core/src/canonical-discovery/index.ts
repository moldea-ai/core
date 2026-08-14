import {
  RepositorySourceException,
  isRepositoryPath,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import {
  classifyCanonicalEntry,
  type ICanonicalFileKind,
} from '../canonical-discovery-validation/index.js';
import type { ICoreResourceLimits } from '../contracts/index.js';
import {
  createCoreDiagnosticCollector,
  type ICoreDiagnosticCollector,
} from '../diagnostic-utilities/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { compareExactStrings } from '../format-validation/index.js';
import { freezeRecursively } from '../immutable/index.js';

const MOLDEA_ROOT = parseRepositoryPath('/moldea');
const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const PROJECT_PATH = parseRepositoryPath('/moldea/project.md');

// immutable assets discovered for one convention-based agent directory
export interface IDiscoveredAgentAssets {
  readonly id: string;
  readonly path: IRepositoryPath;
  readonly description: IRepositoryPath | null;
  readonly instruction: IRepositoryPath | null;
  readonly handoffDescription: IRepositoryPath | null;
}

// immutable canonical inventory produced before cross-file validation
export interface ICanonicalDiscoveryInventory {
  readonly manifest: IRepositoryPath | null;
  readonly project: IRepositoryPath | null;
  readonly context: readonly IRepositoryPath[];
  readonly decisions: readonly IRepositoryPath[];
  readonly runtimeGuidance: readonly IRepositoryPath[];
  readonly agents: readonly IDiscoveredAgentAssets[];
}

// internal discovery result retained even when structural diagnostics exist
export interface ICanonicalDiscoveryResult {
  readonly valid: boolean;
  readonly inventory: ICanonicalDiscoveryInventory;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

// exact foundation entries prelocated by an owning repository inspection
export interface ICanonicalDiscoveryFoundationEntries {
  readonly moldeaRoot: IRepositoryEntry | null;
  readonly manifest: IRepositoryEntry | null;
  readonly project: IRepositoryEntry | null;
}

interface IMutableDiscoveredAgentAssets {
  id: string;
  path: IRepositoryPath;
  description: IRepositoryPath | null;
  instruction: IRepositoryPath | null;
  handoffDescription: IRepositoryPath | null;
}

interface IWorkingInventory {
  manifest: IRepositoryPath | null;
  project: IRepositoryPath | null;
  context: Set<IRepositoryPath>;
  decisions: Set<IRepositoryPath>;
  runtimeGuidance: Set<IRepositoryPath>;
  agents: Map<string, IMutableDiscoveredAgentAssets>;
}

const createWorkingInventory = (): IWorkingInventory => ({
  agents: new Map(),
  context: new Set(),
  decisions: new Set(),
  manifest: null,
  project: null,
  runtimeGuidance: new Set(),
});

const invalidSourceData = (
  operation: 'get-entry' | 'list-entries',
  path: IRepositoryPath | null,
): never => {
  throw new RepositorySourceException({
    code: 'INVALID_SOURCE_DATA',
    operation,
    path,
    retryable: false,
  });
};

const copyReaderEntry = (
  candidate: unknown,
  operation: 'get-entry' | 'list-entries',
  expectedPath?: IRepositoryPath,
): IRepositoryEntry => {
  if (typeof candidate !== 'object' || candidate === null) {
    return invalidSourceData(operation, expectedPath ?? null);
  }

  const record = candidate as Readonly<Record<string, unknown>>;
  const pathCandidate = record['path'];
  const typeCandidate = record['type'];

  if (typeof pathCandidate !== 'string' || !isRepositoryPath(pathCandidate)) {
    return invalidSourceData(operation, expectedPath ?? null);
  }

  const path = parseRepositoryPath(pathCandidate);

  if (expectedPath !== undefined && path !== expectedPath) {
    return invalidSourceData(operation, path);
  }

  if (typeCandidate !== 'file' && typeCandidate !== 'directory' && typeCandidate !== 'symlink') {
    return invalidSourceData(operation, path);
  }

  return { path, type: typeCandidate };
};

const readExactEntry = async (
  repository: IRepositoryReader,
  path: IRepositoryPath,
  signal: AbortSignal | undefined,
): Promise<IRepositoryEntry | null> => {
  const candidate = await repository.getEntry(path, signal === undefined ? undefined : { signal });
  return candidate === null ? null : copyReaderEntry(candidate, 'get-entry', path);
};

const addEntryTypeDiagnostic = (
  diagnostics: ICoreDiagnosticCollector,
  entry: IRepositoryEntry,
  expectedType: 'file' | 'directory',
): void => {
  diagnostics.add({
    code: 'MOLDEA_ENTRY_TYPE_INVALID',
    details: { actualType: entry.type, expectedType },
    path: entry.path,
  });
};

const getAgent = (
  agents: Map<string, IMutableDiscoveredAgentAssets>,
  agentId: string,
): IMutableDiscoveredAgentAssets => {
  const existing = agents.get(agentId);

  if (existing !== undefined) {
    return existing;
  }

  const created: IMutableDiscoveredAgentAssets = {
    description: null,
    handoffDescription: null,
    id: agentId,
    instruction: null,
    path: parseRepositoryPath(`/moldea/agents/${agentId}`),
  };
  agents.set(agentId, created);

  return created;
};

const retainCanonicalFile = (
  inventory: IWorkingInventory,
  path: IRepositoryPath,
  fileKind: ICanonicalFileKind,
  agentId: string | null,
): void => {
  switch (fileKind) {
    case 'manifest':
      inventory.manifest = path;
      return;
    case 'project':
      inventory.project = path;
      return;
    case 'context':
      inventory.context.add(path);
      return;
    case 'decision':
      inventory.decisions.add(path);
      return;
    case 'runtime-guidance':
      inventory.runtimeGuidance.add(path);
      return;
    default:
      break;
  }

  if (agentId === null) {
    return invalidSourceData('list-entries', path);
  }

  const agent = getAgent(inventory.agents, agentId);

  if (fileKind === 'agent-description') {
    agent.description = path;
  } else if (fileKind === 'agent-instruction') {
    agent.instruction = path;
  } else {
    agent.handoffDescription = path;
  }
};

const finalizeInventory = (working: IWorkingInventory): ICanonicalDiscoveryInventory => {
  const sortPaths = (paths: ReadonlySet<IRepositoryPath>): IRepositoryPath[] => {
    return [...paths].sort(compareExactStrings);
  };
  const agents = [...working.agents.values()]
    .sort((left, right) => compareExactStrings(left.id, right.id))
    .map((agent) => freezeRecursively({ ...agent }));

  return freezeRecursively({
    agents,
    context: sortPaths(working.context),
    decisions: sortPaths(working.decisions),
    manifest: working.manifest,
    project: working.project,
    runtimeGuidance: sortPaths(working.runtimeGuidance),
  });
};

const finalizeResult = (
  working: IWorkingInventory,
  diagnostics: ICoreDiagnosticCollector,
): ICanonicalDiscoveryResult => {
  const finalizedDiagnostics = diagnostics.finalize();

  return freezeRecursively({
    diagnostics: finalizedDiagnostics,
    inventory: finalizeInventory(working),
    valid: finalizedDiagnostics.length === 0,
  });
};

const retainFoundationEntry = (
  entry: IRepositoryEntry | null,
  expectedPath: IRepositoryPath,
  missingCode: 'MOLDEA_MANIFEST_MISSING' | 'MOLDEA_PROJECT_FILE_MISSING',
  working: IWorkingInventory,
  diagnostics: ICoreDiagnosticCollector,
): void => {
  if (entry === null) {
    diagnostics.add({ code: missingCode, path: expectedPath });
    return;
  }

  if (entry.type === 'file') {
    if (expectedPath === MANIFEST_PATH) {
      working.manifest = expectedPath;
    } else {
      working.project = expectedPath;
    }
    return;
  }

  if (entry.type === 'symlink') {
    diagnostics.add({ code: 'MOLDEA_CANONICAL_ASSET_SYMLINK', path: expectedPath });
    return;
  }

  addEntryTypeDiagnostic(diagnostics, entry, 'file');
};

const checkFoundationListing = (
  listedEntry: IRepositoryEntry,
  exactEntry: IRepositoryEntry | null,
): void => {
  if (exactEntry === null || exactEntry.type !== listedEntry.type) {
    return invalidSourceData('list-entries', listedEntry.path);
  }
};

/**
 * Discovers and classifies version 1 canonical assets through one repository snapshot.
 * @param repository The coherent source-neutral repository reader.
 * @param limits The immutable Core limits governing diagnostic collection.
 * @param signal Optional cancellation forwarded to every repository operation.
 * @param foundations Optional exact foundation entries already observed by this inspection.
 * @returns A deeply immutable inventory and its deterministic structural diagnostics.
 * @throws
 * - ENTRY_NOT_FOUND: The reader snapshot became inconsistent during discovery.
 * - ENTRY_NOT_DIRECTORY: The reader snapshot became inconsistent during discovery.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source was unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during discovery.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Discovery or a repository operation was aborted.
 */
export const discoverCanonicalAssets = async (
  repository: IRepositoryReader,
  limits: ICoreResourceLimits,
  signal?: AbortSignal,
  foundations?: ICanonicalDiscoveryFoundationEntries,
): Promise<ICanonicalDiscoveryResult> => {
  const diagnostics = createCoreDiagnosticCollector(limits, 'inspect-project');
  const working = createWorkingInventory();
  const moldeaEntry =
    foundations === undefined
      ? await readExactEntry(repository, MOLDEA_ROOT, signal)
      : foundations.moldeaRoot;

  if (moldeaEntry === null) {
    diagnostics.add({ code: 'MOLDEA_MANIFEST_MISSING', path: MANIFEST_PATH });
    diagnostics.add({ code: 'MOLDEA_PROJECT_FILE_MISSING', path: PROJECT_PATH });
    return finalizeResult(working, diagnostics);
  }

  if (moldeaEntry.type !== 'directory') {
    addEntryTypeDiagnostic(diagnostics, moldeaEntry, 'directory');
    return finalizeResult(working, diagnostics);
  }

  const manifestEntry =
    foundations === undefined
      ? await readExactEntry(repository, MANIFEST_PATH, signal)
      : foundations.manifest;
  const projectEntry =
    foundations === undefined
      ? await readExactEntry(repository, PROJECT_PATH, signal)
      : foundations.project;
  retainFoundationEntry(
    manifestEntry,
    MANIFEST_PATH,
    'MOLDEA_MANIFEST_MISSING',
    working,
    diagnostics,
  );
  retainFoundationEntry(
    projectEntry,
    PROJECT_PATH,
    'MOLDEA_PROJECT_FILE_MISSING',
    working,
    diagnostics,
  );

  const seenPaths = new Set<IRepositoryPath>();
  let listedManifest = false;
  let listedProject = false;

  const listOptions =
    signal === undefined ? { prefix: MOLDEA_ROOT } : { prefix: MOLDEA_ROOT, signal };

  for await (const candidate of repository.listEntries(listOptions)) {
    const entry = copyReaderEntry(candidate, 'list-entries');

    if (!entry.path.startsWith('/moldea/')) {
      return invalidSourceData('list-entries', entry.path);
    }

    if (seenPaths.has(entry.path)) {
      return invalidSourceData('list-entries', entry.path);
    }

    seenPaths.add(entry.path);

    if (entry.path === MANIFEST_PATH) {
      checkFoundationListing(entry, manifestEntry);
      listedManifest = true;
      continue;
    }

    if (entry.path === PROJECT_PATH) {
      checkFoundationListing(entry, projectEntry);
      listedProject = true;
      continue;
    }

    const classification = classifyCanonicalEntry(entry);

    switch (classification.kind) {
      case 'canonical-file':
        retainCanonicalFile(working, entry.path, classification.fileKind, classification.agentId);
        break;
      case 'agent-directory':
        getAgent(working.agents, classification.agentId);
        break;
      case 'canonical-asset-symlink':
        diagnostics.add({ code: 'MOLDEA_CANONICAL_ASSET_SYMLINK', path: entry.path });
        break;
      case 'entry-type-invalid':
        addEntryTypeDiagnostic(diagnostics, entry, classification.expectedType);
        break;
      case 'unrecognized':
        diagnostics.add({
          code: 'MOLDEA_CANONICAL_PATH_UNRECOGNIZED',
          details: { entryType: entry.type },
          path: entry.path,
        });
        break;
      case 'ignored-directory':
      case 'structural-directory':
        break;
    }
  }

  if ((manifestEntry !== null) !== listedManifest) {
    return invalidSourceData('list-entries', MANIFEST_PATH);
  }

  if ((projectEntry !== null) !== listedProject) {
    return invalidSourceData('list-entries', PROJECT_PATH);
  }

  return finalizeResult(working, diagnostics);
};
