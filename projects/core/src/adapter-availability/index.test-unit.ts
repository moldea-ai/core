// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IRuntimeAdapterResult } from '../adapter/index.js';
import type { IRuntimeManifestLocation } from '../manifest-validation/index.js';
import { normalizeCoreOptions } from '../options/index.js';

import { validateRuntimeAdapterAvailability } from './index.js';

const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const RANGE = {
  end: { column: 10, line: 4, offset: 42 },
  start: { column: 4, line: 4, offset: 36 },
};

const createLocation = (adapterId: string, agentId: string): IRuntimeManifestLocation => ({
  adapterId,
  agentId,
  path: MANIFEST_PATH,
  pointer: `/agents/${agentId}/runtime/id`,
  range: RANGE,
});

const inspect = (): Promise<IRuntimeAdapterResult> =>
  Promise.resolve({ diagnostics: [], evidence: [] });

describe('runtime adapter availability', () => {
  test('reports every unavailable package-backed runtime while accepting custom', () => {
    const diagnostics = validateRuntimeAdapterAvailability(
      [createLocation('custom', 'custom-agent'), createLocation('openai', 'assistant')],
      1,
      normalizeCoreOptions(undefined),
    );

    expect(diagnostics).toMatchObject([
      {
        code: 'MOLDEA_RUNTIME_ADAPTER_UNAVAILABLE',
        entity: { adapterId: 'openai', agentId: 'assistant' },
        path: MANIFEST_PATH,
        pointer: '/agents/assistant/runtime/id',
        range: RANGE,
      },
    ]);
  });

  test('reports a configured adapter that does not support the active format', () => {
    const options = normalizeCoreOptions({
      adapters: [{ id: 'openai', inspect, supportedRepositoryFormatVersions: [1] }],
    });
    const incompatibleOptions = {
      ...options,
      adapters: [
        {
          ...options.adapters[0]!,
          supportedRepositoryFormatVersions: [],
        },
      ],
    };
    const diagnostics = validateRuntimeAdapterAvailability(
      [createLocation('openai', 'assistant')],
      1,
      incompatibleOptions,
    );

    expect(diagnostics).toMatchObject([
      {
        code: 'MOLDEA_RUNTIME_ADAPTER_FORMAT_UNSUPPORTED',
        entity: { adapterId: 'openai', agentId: 'assistant' },
      },
    ]);
  });
});
