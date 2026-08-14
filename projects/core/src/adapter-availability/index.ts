import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { createCoreDiagnosticCollector } from '../diagnostic-utilities/index.js';
import type { IRepositoryFormatVersion } from '../format/index.js';
import type { IRuntimeManifestLocation } from '../manifest-validation/index.js';
import type { ICoreOptionsSnapshot } from '../options/index.js';

/**
 * Validates adapter availability and format support before any runtime adapter runs.
 * @param locations The recognized runtime declarations retained from manifest parsing.
 * @param formatVersion The active repository-format version.
 * @param options The immutable Core adapter registry and limits.
 * @returns Frozen deterministic preflight diagnostics.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: The raw Core diagnostic limit was exceeded.
 */
export const validateRuntimeAdapterAvailability = (
  locations: readonly IRuntimeManifestLocation[],
  formatVersion: IRepositoryFormatVersion,
  options: ICoreOptionsSnapshot,
): readonly ICoreDiagnostic[] => {
  const diagnostics = createCoreDiagnosticCollector(options.limits, 'inspect-project');
  const adapters = new Map(options.adapters.map((adapter) => [adapter.id, adapter]));

  for (const location of locations) {
    if (location.adapterId === 'custom') {
      continue;
    }

    const adapter = adapters.get(location.adapterId);

    if (adapter === undefined) {
      diagnostics.add({
        code: 'MOLDEA_RUNTIME_ADAPTER_UNAVAILABLE',
        entity: { adapterId: location.adapterId, agentId: location.agentId },
        path: location.path,
        pointer: location.pointer,
        range: location.range,
      });
      continue;
    }

    if (!adapter.supportedRepositoryFormatVersions.includes(formatVersion)) {
      diagnostics.add({
        code: 'MOLDEA_RUNTIME_ADAPTER_FORMAT_UNSUPPORTED',
        entity: { adapterId: location.adapterId, agentId: location.agentId },
        path: location.path,
        pointer: location.pointer,
        range: location.range,
      });
    }
  }

  return diagnostics.finalize();
};
