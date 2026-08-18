import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { IAnthropicInspectionSession } from '../contracts/index.js';
import { discoverAnthropicPackage } from '../package-discovery/index.js';
import { analyzeAnthropicSource } from '../source-analysis/index.js';

/**
 * Creates one operation-local Anthropic inspection session and its deterministic caches.
 * @param context The Core-owned adapter context.
 * @returns The source and package analysis session.
 */
export const createAnthropicInspectionSession = (
  context: IRuntimeAdapterContext,
): IAnthropicInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeAnthropicSource,
    discoverPackage: (path, signal) => discoverAnthropicPackage(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
