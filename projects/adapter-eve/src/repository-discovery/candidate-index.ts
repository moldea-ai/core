import { posix } from 'node:path';

import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

import { EVE_AUTHORED_MODULE_EXTENSIONS, EVE_TOOL_NAME_PATTERN } from '../constants/index.js';
import type {
  IEveAgentRootIndex,
  IEveSkillCandidate,
  IEveSubagentCandidate,
  IEveToolCandidate,
} from '../contracts/index.js';

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const getAuthoredExtension = (path: string): string | null =>
  EVE_AUTHORED_MODULE_EXTENSIONS.find((extension) => path.endsWith(extension)) ?? null;

const removeExtension = (path: string, extension: string): string =>
  path.slice(0, -extension.length);

const getDirectRelativePath = (root: IRepositoryPath, path: IRepositoryPath): string | null => {
  const prefix = root === '/' ? '/' : `${root}/`;

  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
};

const indexExtensionNamespaces = (
  root: IRepositoryPath,
  entries: readonly IRepositoryEntry[],
): ReadonlySet<string> => {
  const namespaces = new Set<string>();

  for (const entry of entries) {
    if (entry.type !== 'file') {
      continue;
    }

    const relative = getDirectRelativePath(root, entry.path);

    if (relative === null || !relative.startsWith('extensions/')) {
      continue;
    }

    const extensionRelative = relative.slice('extensions/'.length);
    const segments = extensionRelative.split('/');
    const extension = getAuthoredExtension(extensionRelative);
    const firstSegment = segments[0];
    const secondSegment = segments[1];
    let namespace: string | null = null;

    if (extension !== null && segments.length === 1 && firstSegment !== undefined) {
      namespace = removeExtension(firstSegment, extension);
    } else if (
      extension !== null &&
      segments.length === 2 &&
      firstSegment !== undefined &&
      secondSegment !== undefined &&
      removeExtension(secondSegment, extension) === 'extension'
    ) {
      namespace = firstSegment;
    }

    if (namespace !== null && EVE_TOOL_NAME_PATTERN.test(namespace)) {
      namespaces.add(namespace);
    }
  }

  return namespaces;
};

const isExtensionReserved = (name: string, namespaces: ReadonlySet<string>): boolean =>
  [...namespaces].some((namespace) => name.startsWith(`${namespace}__`));

const indexTools = (
  root: IRepositoryPath,
  entries: readonly IRepositoryEntry[],
  namespaces: ReadonlySet<string>,
): readonly IEveToolCandidate[] => {
  const raw = entries.flatMap((entry) => {
    if (entry.type !== 'file') {
      return [];
    }

    const relative = getDirectRelativePath(root, entry.path);

    if (relative === null || !relative.startsWith('tools/')) {
      return [];
    }

    const toolRelative = relative.slice('tools/'.length);
    const extension = getAuthoredExtension(toolRelative);

    if (extension === null) {
      return [];
    }

    const withoutExtension = removeExtension(toolRelative, extension);
    const segments = withoutExtension.split('/');

    return [{ entry, extension, relativePath: withoutExtension, segments }];
  });
  const slots = new Map<string, number>();

  for (const candidate of raw) {
    slots.set(candidate.relativePath, (slots.get(candidate.relativePath) ?? 0) + 1);
  }

  return Object.freeze(
    raw.map(({ entry, extension, relativePath, segments }) => {
      const runtimeName = segments.join('-');

      return Object.freeze({
        isCollidedSlot: (slots.get(relativePath) ?? 0) > 1,
        isExtensionReserved: isExtensionReserved(segments[0] ?? '', namespaces),
        isSupportedSource: extension === '.ts',
        path: entry.path,
        relativePath,
        runtimeName,
        segments: Object.freeze(segments),
      });
    }),
  );
};

const indexSkills = (
  root: IRepositoryPath,
  entries: readonly IRepositoryEntry[],
): readonly IEveSkillCandidate[] => {
  const raw: Omit<IEveSkillCandidate, 'isCollidedSlot'>[] = [];

  for (const entry of entries) {
    if (entry.type !== 'file') {
      continue;
    }

    const relative = getDirectRelativePath(root, entry.path);

    if (relative === null || !relative.startsWith('skills/')) {
      continue;
    }

    const skillRelative = relative.slice('skills/'.length);
    const segments = skillRelative.split('/');
    const firstSegment = segments[0];
    const secondSegment = segments[1];

    if (segments.length === 2 && firstSegment !== undefined && secondSegment === 'SKILL.md') {
      raw.push({ identity: firstSegment, kind: 'packaged', path: entry.path });
      continue;
    }

    if (segments.length !== 1) {
      continue;
    }

    if (firstSegment === undefined) {
      continue;
    }

    if (/\.md$/iu.test(firstSegment)) {
      raw.push({ identity: firstSegment.slice(0, -3), kind: 'markdown', path: entry.path });
      continue;
    }

    const extension = getAuthoredExtension(firstSegment);

    if (extension !== null) {
      raw.push({
        identity: removeExtension(firstSegment, extension),
        kind: extension === '.ts' ? 'typescript' : 'markdown',
        path: entry.path,
      });
    }
  }

  const identities = new Map<string, number>();

  for (const candidate of raw) {
    identities.set(candidate.identity, (identities.get(candidate.identity) ?? 0) + 1);
  }

  return Object.freeze(
    raw.map((candidate) =>
      Object.freeze({
        ...candidate,
        isCollidedSlot: (identities.get(candidate.identity) ?? 0) > 1,
      }),
    ),
  );
};

const indexSubagents = (
  root: IRepositoryPath,
  entries: readonly IRepositoryEntry[],
  namespaces: ReadonlySet<string>,
): readonly IEveSubagentCandidate[] => {
  const raw: Array<{
    readonly agentPath: IRepositoryPath;
    readonly kind: 'directory' | 'file';
    readonly runtimeName: string;
  }> = [];

  for (const entry of entries) {
    if (entry.type !== 'file') {
      continue;
    }

    const relative = getDirectRelativePath(root, entry.path);

    if (relative === null || !relative.startsWith('subagents/')) {
      continue;
    }

    const subagentRelative = relative.slice('subagents/'.length);
    const segments = subagentRelative.split('/');
    const firstSegment = segments[0];
    const secondSegment = segments[1];

    if (segments.length === 2 && firstSegment !== undefined && secondSegment !== undefined) {
      const extension = getAuthoredExtension(secondSegment);

      if (extension !== null && removeExtension(secondSegment, extension) === 'agent') {
        raw.push({ agentPath: entry.path, kind: 'directory', runtimeName: firstSegment });
      }

      continue;
    }

    if (segments.length === 1 && firstSegment !== undefined) {
      const extension = getAuthoredExtension(firstSegment);

      if (extension !== null) {
        raw.push({
          agentPath: entry.path,
          kind: 'file',
          runtimeName: removeExtension(firstSegment, extension),
        });
      }
    }
  }

  const identities = new Map<string, number>();

  for (const candidate of raw) {
    identities.set(candidate.runtimeName, (identities.get(candidate.runtimeName) ?? 0) + 1);
  }

  return Object.freeze(
    raw.map((candidate) =>
      Object.freeze({
        agentPath: candidate.agentPath,
        isDirectoryBacked:
          candidate.kind === 'directory' &&
          candidate.agentPath.endsWith('/agent.ts') &&
          (identities.get(candidate.runtimeName) ?? 0) === 1,
        isExtensionReserved: isExtensionReserved(candidate.runtimeName, namespaces),
        runtimeName: candidate.runtimeName,
      }),
    ),
  );
};

/** Creates the deterministic candidate index for one selected Eve agent root. */
export const createEveAgentRootIndex = (
  root: IRepositoryPath,
  sourceEntries: readonly IRepositoryEntry[],
): IEveAgentRootIndex => {
  const entries = [...sourceEntries].sort((left, right) => compareStrings(left.path, right.path));
  const namespaces = indexExtensionNamespaces(root, entries);
  const directEntries = entries.filter((entry) => {
    const relative = getDirectRelativePath(root, entry.path);
    return relative !== null && !relative.includes('/');
  });
  const agentCandidates = directEntries.filter((entry) => {
    const extension = getAuthoredExtension(entry.path);
    return (
      entry.type === 'file' &&
      extension !== null &&
      posix.basename(entry.path, extension) === 'agent'
    );
  });
  const instructionEntries = entries.filter((entry) => {
    const relative = getDirectRelativePath(root, entry.path);

    return (
      relative !== null &&
      (relative === 'instructions' ||
        (!relative.includes('/') &&
          (/^instructions\.md$/iu.test(relative) ||
            /^system\.md$/iu.test(relative) ||
            (getAuthoredExtension(relative) !== null &&
              ['instructions', 'system'].includes(
                removeExtension(relative, getAuthoredExtension(relative) ?? ''),
              )))))
    );
  });

  return Object.freeze({
    extensionNamespaces: namespaces,
    instructionEntries: Object.freeze(instructionEntries),
    isAgentSlotCollided: agentCandidates.length > 1,
    skillCandidates: indexSkills(root, entries),
    subagentCandidates: indexSubagents(root, entries, namespaces),
    toolCandidates: indexTools(root, entries, namespaces),
  });
};
