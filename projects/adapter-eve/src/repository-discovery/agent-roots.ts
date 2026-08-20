import { posix } from 'node:path';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { IEveAgentRoot, IEvePackageObservation } from '../contracts/index.js';

const isSafeRuntimeName = (runtimeName: string): boolean =>
  runtimeName.length > 0 &&
  !runtimeName.includes('\0') &&
  !runtimeName.includes('\n') &&
  !runtimeName.includes('\r') &&
  runtimeName === runtimeName.trim();

const getPackageRuntimeName = (packageName: string | null): string | null => {
  if (packageName === null || packageName.length === 0) {
    return null;
  }

  const runtimeName = packageName.slice(packageName.lastIndexOf('/') + 1);

  return isSafeRuntimeName(runtimeName) ? runtimeName : null;
};

const getLocalRoot = (
  path: IRepositoryPath,
  baseRoot: IRepositoryPath,
  layout: IEveAgentRoot['layout'],
): IEveAgentRoot | null => {
  const prefix = `${baseRoot === '/' ? '' : baseRoot}/subagents/`;

  if (!path.startsWith(prefix) || !path.endsWith('/agent.ts')) {
    return null;
  }

  const relative = path.slice(prefix.length, -'/agent.ts'.length);
  const segments = relative.split('/');

  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  if (segments.length % 2 === 0) {
    return null;
  }

  for (let index = 1; index < segments.length; index += 2) {
    if (segments[index] !== 'subagents') {
      return null;
    }
  }

  const agentRoot = posix.dirname(path) as IRepositoryPath;
  const parentRoot = posix.dirname(posix.dirname(agentRoot)) as IRepositoryPath;
  const runtimeName = segments.at(-1) ?? '';

  return Object.freeze({
    agentKind: 'local-subagent',
    agentRoot,
    layout,
    parentRoot,
    runtimeName: isSafeRuntimeName(runtimeName) ? runtimeName : null,
  });
};

/** Resolves one bound `agent.ts` into an exact Eve root or local-subagent layout. */
export const resolveEveAgentRoot = (
  path: IRepositoryPath,
  packageObservation: IEvePackageObservation,
): IEveAgentRoot | null => {
  if (posix.basename(path) !== 'agent.ts') {
    return null;
  }

  const packageRoot = parseRepositoryPath(posix.dirname(packageObservation.path));
  const flatPath = parseRepositoryPath(posix.join(packageRoot, 'agent.ts'));
  const nestedRoot = parseRepositoryPath(posix.join(packageRoot, 'agent'));
  const nestedPath = parseRepositoryPath(posix.join(nestedRoot, 'agent.ts'));

  if (path === flatPath) {
    return Object.freeze({
      agentKind: 'root',
      agentRoot: packageRoot,
      layout: 'flat',
      parentRoot: null,
      runtimeName: getPackageRuntimeName(packageObservation.manifestPackageName),
    });
  }

  if (path === nestedPath) {
    return Object.freeze({
      agentKind: 'root',
      agentRoot: nestedRoot,
      layout: 'nested',
      parentRoot: null,
      runtimeName: getPackageRuntimeName(packageObservation.manifestPackageName),
    });
  }

  return getLocalRoot(path, packageRoot, 'flat') ?? getLocalRoot(path, nestedRoot, 'nested');
};
