import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

import { isContextPath, isRuntimeGuidancePath } from '../format-validation/index.js';

// canonical file categories retained by repository discovery
export type ICanonicalFileKind =
  | 'manifest'
  | 'project'
  | 'context'
  | 'decision'
  | 'runtime-guidance'
  | 'agent-description'
  | 'agent-instruction'
  | 'agent-handoff-description';

// exhaustive internal classification for one entry below /moldea
export type ICanonicalEntryClassification =
  | {
      readonly kind: 'canonical-file';
      readonly fileKind: ICanonicalFileKind;
      readonly agentId: string | null;
    }
  | { readonly kind: 'agent-directory'; readonly agentId: string }
  | { readonly kind: 'structural-directory' | 'ignored-directory' }
  | { readonly kind: 'canonical-asset-symlink' }
  | { readonly kind: 'entry-type-invalid'; readonly expectedType: 'file' | 'directory' }
  | { readonly kind: 'unrecognized' };

const AGENT_ASSET_PATTERN =
  /^\/moldea\/agents\/([^/]+)\/(description|instruction|handoff-description)\.md$/u;
const AGENT_DIRECTORY_PATTERN = /^\/moldea\/agents\/([^/]+)$/u;
const DECISION_CANDIDATE_PATTERN = /^\/moldea\/decisions\/[^/]+\.md$/u;

const readCanonicalFile = (
  path: IRepositoryPath,
): Extract<ICanonicalEntryClassification, { readonly kind: 'canonical-file' }> | null => {
  if (path === '/moldea/moldea.yaml') {
    return { agentId: null, fileKind: 'manifest', kind: 'canonical-file' };
  }

  if (path === '/moldea/project.md') {
    return { agentId: null, fileKind: 'project', kind: 'canonical-file' };
  }

  if (isContextPath(path, false)) {
    return { agentId: null, fileKind: 'context', kind: 'canonical-file' };
  }

  if (DECISION_CANDIDATE_PATTERN.test(path)) {
    return { agentId: null, fileKind: 'decision', kind: 'canonical-file' };
  }

  if (isRuntimeGuidancePath(path)) {
    return { agentId: null, fileKind: 'runtime-guidance', kind: 'canonical-file' };
  }

  const agentAsset = AGENT_ASSET_PATTERN.exec(path);

  if (agentAsset === null) {
    return null;
  }

  const agentId = agentAsset[1];
  const fileName = agentAsset[2];

  if (agentId === undefined || fileName === undefined) {
    return null;
  }

  const fileKind =
    fileName === 'description'
      ? 'agent-description'
      : fileName === 'instruction'
        ? 'agent-instruction'
        : 'agent-handoff-description';

  return { agentId, fileKind, kind: 'canonical-file' };
};

const readAgentDirectoryId = (path: IRepositoryPath): string | null => {
  return AGENT_DIRECTORY_PATTERN.exec(path)?.[1] ?? null;
};

const isRequiredDirectoryPath = (path: IRepositoryPath): boolean => {
  return (
    path === '/moldea' ||
    path === '/moldea/context' ||
    path === '/moldea/decisions' ||
    path === '/moldea/runtimes' ||
    path === '/moldea/agents'
  );
};

const isPermittedStructuralDirectoryPath = (path: IRepositoryPath): boolean => {
  return (
    isRequiredDirectoryPath(path) ||
    path.startsWith('/moldea/context/') ||
    path.startsWith('/moldea/runtimes/')
  );
};

/**
 * Classifies one reader entry against the version 1 canonical layout.
 * @param entry The detached entry beneath the canonical moldea root.
 * @returns Its canonical category or the precise structural failure category.
 */
export const classifyCanonicalEntry = (entry: IRepositoryEntry): ICanonicalEntryClassification => {
  const canonicalFile = readCanonicalFile(entry.path);

  if (canonicalFile !== null) {
    if (entry.type === 'file') {
      return canonicalFile;
    }

    return entry.type === 'symlink'
      ? { kind: 'canonical-asset-symlink' }
      : { expectedType: 'file', kind: 'entry-type-invalid' };
  }

  const agentId = readAgentDirectoryId(entry.path);

  if (agentId !== null) {
    return entry.type === 'directory'
      ? { agentId, kind: 'agent-directory' }
      : { expectedType: 'directory', kind: 'entry-type-invalid' };
  }

  if (isRequiredDirectoryPath(entry.path)) {
    return entry.type === 'directory'
      ? { kind: 'structural-directory' }
      : { expectedType: 'directory', kind: 'entry-type-invalid' };
  }

  if (entry.type === 'directory') {
    return isPermittedStructuralDirectoryPath(entry.path)
      ? { kind: 'structural-directory' }
      : { kind: 'ignored-directory' };
  }

  return { kind: 'unrecognized' };
};
