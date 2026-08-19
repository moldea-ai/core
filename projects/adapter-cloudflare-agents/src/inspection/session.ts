import { createInspectionSession } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterContext } from '@moldea.ai/core/adapter';

import type { ICloudflareAgentsInspectionSession } from '../contracts/index.js';
import { discoverCloudflareAgentsPackage } from '../package-discovery/index.js';
import { analyzeCloudflareAgentsSource } from '../source-analysis/index.js';

/** Creates one operation-local Cloudflare Agents inspection session. */
export const createCloudflareAgentsInspectionSession = (
  context: IRuntimeAdapterContext,
): ICloudflareAgentsInspectionSession =>
  createInspectionSession({
    analyzeSource: analyzeCloudflareAgentsSource,
    discoverPackage: (path, signal) =>
      discoverCloudflareAgentsPackage(context.repository, path, signal),
    getEntry: (path, signal) =>
      context.repository.getEntry(path, signal === undefined ? undefined : { signal }),
    readFile: (path, signal) =>
      context.repository.readFile(path, signal === undefined ? undefined : { signal }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
