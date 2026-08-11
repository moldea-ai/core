import { parseRepositoryPath, type IRepositoryEntry } from '@moldea.ai/repository';

import { inspectAgentAssets, type IInspectedAgentAssets } from '../agent-assets/index.js';
import { discoverCanonicalAssets } from '../canonical-discovery/index.js';
import type { IIndexedManifest, IMoldeaProjectIndex } from '../contracts/index.js';
import { readDecisionGraph } from '../decision-graph/index.js';
import {
  createCoreDiagnosticCollector,
  type ICoreDiagnosticCollector,
} from '../diagnostic-utilities/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import type { IRepositoryFormatVersion } from '../format/index.js';
import { freezeRecursively } from '../immutable/index.js';
import { validateManifestRelationships } from '../manifest-relationship-validation/index.js';
import { inspectManifestDocument } from '../manifest/index.js';
import { inspectMirrors, type IAgentMirrorInspection } from '../mirrors/index.js';
import type { ICoreOptionsSnapshot } from '../options/index.js';
import { readProjectAssets, readProjectFile } from '../project-assets/index.js';
import { createProjectIndex } from '../project-index/index.js';
import type { IRepositoryInspectionSession } from '../repository-inspection-session/index.js';
import { validateRepositoryReferences } from '../repository-reference-validation/index.js';
import { readRuntimeGuidance } from '../runtime-guidance/index.js';

const MOLDEA_ROOT = parseRepositoryPath('/moldea');
const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const PROJECT_PATH = parseRepositoryPath('/moldea/project.md');

// internal all-or-nothing universal result retained for later adapter execution
export interface IUniversalProjectInspectionResult {
  readonly formatVersion: IRepositoryFormatVersion | null;
  readonly project: IMoldeaProjectIndex | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

// shared inspection state supplied by the public repository-level orchestrator
export interface IUniversalProjectInspectionContext {
  readonly session: IRepositoryInspectionSession;
  readonly signal?: AbortSignal;
}

const addDiagnostics = (
  collector: ICoreDiagnosticCollector,
  diagnostics: readonly ICoreDiagnostic[],
): void => {
  for (const diagnostic of diagnostics) {
    collector.add(diagnostic);
  }
};

/**
 * Executes every universal repository-format phase before framework adapter validation.
 * @param context The shared inspection session and optional cancellation signal.
 * @param options The immutable Core configuration snapshot.
 * @returns The frozen provisional index only when no universal diagnostic remains.
 * @throws
 * - INVALID_REPOSITORY_PATH: A repository path is invalid.
 * - ENTRY_NOT_FOUND: A discovered file disappeared from the reader snapshot.
 * - ENTRY_NOT_FILE: A discovered file changed type during inspection.
 * - ENTRY_NOT_DIRECTORY: A discovered directory changed type during inspection.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during inspection.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Project inspection or a repository operation was aborted.
 */
export const inspectUniversalProject = async (
  context: IUniversalProjectInspectionContext,
  options: ICoreOptionsSnapshot,
): Promise<IUniversalProjectInspectionResult> => {
  const { session, signal } = context;
  const collector = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  const operationOptions = signal === undefined ? undefined : { signal };
  const moldeaRoot = await session.reader.getEntry(MOLDEA_ROOT, operationOptions);
  let manifestEntry: IRepositoryEntry | null = null;
  let projectEntry: IRepositoryEntry | null = null;

  let indexedManifest: IIndexedManifest | null = null;
  let formatVersion: IRepositoryFormatVersion | null = null;

  if (moldeaRoot?.type === 'directory') {
    manifestEntry = await session.reader.getEntry(MANIFEST_PATH, operationOptions);

    if (manifestEntry?.type === 'file') {
      const content = await session.reader.readFile(MANIFEST_PATH, operationOptions);
      const parsedManifest = await inspectManifestDocument(
        { content, path: MANIFEST_PATH },
        options,
        'inspect-project',
      );
      formatVersion = parsedManifest.formatVersion;
      addDiagnostics(collector, parsedManifest.diagnostics);

      if (parsedManifest.asset !== null && parsedManifest.manifest !== null) {
        indexedManifest = {
          asset: parsedManifest.asset,
          value: parsedManifest.manifest,
        };
      }
    }

    projectEntry = await session.reader.getEntry(PROJECT_PATH, operationOptions);
  }

  const projectFile = await readProjectFile(
    session.reader,
    projectEntry?.type === 'file' ? PROJECT_PATH : null,
    options,
    signal,
  );
  addDiagnostics(collector, projectFile.diagnostics);

  const discovery = await discoverCanonicalAssets(session.reader, options.limits, signal, {
    manifest: manifestEntry,
    moldeaRoot,
    project: projectEntry,
  });
  addDiagnostics(collector, discovery.diagnostics);
  session.throwIfAborted();

  const projectAssets = await readProjectAssets(
    session.reader,
    indexedManifest?.value ?? null,
    discovery,
    options,
    signal,
    projectFile,
  );
  addDiagnostics(collector, projectAssets.diagnostics);

  const runtimeGuidance = await readRuntimeGuidance(
    session.reader,
    discovery.inventory.manifest ?? MANIFEST_PATH,
    indexedManifest?.value ?? null,
    discovery,
    options,
    signal,
  );
  addDiagnostics(collector, runtimeGuidance.diagnostics);

  const decisionGraph = await readDecisionGraph(
    session.reader,
    discovery.inventory.decisions,
    options,
    signal,
  );
  addDiagnostics(collector, decisionGraph.diagnostics);

  let agents: readonly IInspectedAgentAssets[] = [];
  let agentMirrors: readonly IAgentMirrorInspection[] = [];

  if (indexedManifest !== null) {
    const manifestPath = indexedManifest.asset.path;
    const agentAssets = await inspectAgentAssets(
      session.reader,
      indexedManifest.value,
      discovery,
      options,
      signal,
    );
    agents = agentAssets.agents;
    addDiagnostics(collector, agentAssets.diagnostics);

    addDiagnostics(
      collector,
      validateManifestRelationships(
        manifestPath,
        indexedManifest.value,
        discovery,
        decisionGraph.decisions,
        options.limits,
      ),
    );

    addDiagnostics(
      collector,
      await validateRepositoryReferences(
        session.reader,
        manifestPath,
        indexedManifest.value,
        discovery,
        options.limits,
        signal,
      ),
    );

    const mirrorInspection = await inspectMirrors(
      session.reader,
      manifestPath,
      agents,
      options,
      signal,
    );
    agentMirrors = mirrorInspection.agentMirrors;
    addDiagnostics(collector, mirrorInspection.diagnostics);
  }

  session.throwIfAborted();
  const diagnostics = collector.finalize();
  const project =
    diagnostics.length === 0 && indexedManifest !== null && projectAssets.project !== null
      ? createProjectIndex({
          agentMirrors,
          agents,
          context: projectAssets.context,
          decisions: decisionGraph.decisions,
          manifest: indexedManifest,
          project: projectAssets.project,
          runtimes: runtimeGuidance.runtimes,
        })
      : null;

  return freezeRecursively({
    diagnostics,
    formatVersion,
    project,
  });
};
