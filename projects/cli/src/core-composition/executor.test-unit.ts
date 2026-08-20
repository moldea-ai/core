// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { ICore, IProjectInspectionResult } from '@moldea.ai/core';
import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { ACTIVE_RUNTIME_ADAPTERS } from './constants.js';
import { createMoldeaCliCoreInspectionExecutor } from './executor.js';
import { ACTIVE_RUNTIME_ADAPTER_RELEASE_DEFINITIONS } from './release-definitions/index.js';
import type { IMoldeaCliCoreFactory } from './types.js';

const RESOURCE_LIMITS = Object.freeze({
  maxDiagnostics: 32,
  maxEntries: 128,
  maxEvidence: 16,
  maxFileBytes: 4096,
  maxManifestBytes: 2048,
  maxTotalBytes: 8192,
});

const INSPECTION_RESULT = Object.freeze({
  diagnostics: Object.freeze([]),
  evidence: Object.freeze([]),
  formatVersion: null,
  project: null,
  valid: false,
}) satisfies IProjectInspectionResult;

/** Creates a complete Core test double around the observable inspection boundary. */
const createCoreDouble = (): {
  readonly core: ICore;
  readonly inspectProject: ReturnType<typeof vi.fn<ICore['inspectProject']>>;
} => {
  const inspectProject = vi.fn<ICore['inspectProject']>().mockResolvedValue(INSPECTION_RESULT);

  return {
    core: {
      calculateContentDigest: vi.fn<ICore['calculateContentDigest']>(),
      inspectProject,
      normalizeText: vi.fn<ICore['normalizeText']>(),
      parseDecision: vi.fn<ICore['parseDecision']>(),
      parseManifest: vi.fn<ICore['parseManifest']>(),
    },
    inspectProject,
  };
};

/** Creates a minimal adapter definition for deterministic registry-order tests. */
const createAdapter = (id: string): IRuntimeAdapter => ({
  id,
  inspect: () => Promise.resolve(Object.freeze({ diagnostics: [], evidence: [] })),
  supportedRepositoryFormatVersions: Object.freeze([1]),
});

describe('createMoldeaCliCoreInspectionExecutor', () => {
  test('creates fresh Core state with the exact mapped CLI resource limits', async () => {
    const controller = new AbortController();
    const reader = createMemoryRepositoryReader([]);
    const coreDouble = createCoreDouble();
    const coreFactory = vi.fn<IMoldeaCliCoreFactory>().mockReturnValue(coreDouble.core);
    const executeInspection = createMoldeaCliCoreInspectionExecutor(coreFactory);

    await expect(
      executeInspection({
        repository: reader,
        resourceLimits: RESOURCE_LIMITS,
        signal: controller.signal,
      }),
    ).resolves.toBe(INSPECTION_RESULT);
    expect(coreFactory).toHaveBeenCalledOnce();
    const coreFactoryInput = coreFactory.mock.calls[0]?.[0];

    if (coreFactoryInput?.adapters === undefined) {
      throw new TypeError('The Core factory input is required.');
    }

    expect(coreFactoryInput.adapters.map(({ id }) => id)).toStrictEqual([
      'anthropic',
      'claude-agent-sdk',
      'cloudflare-agents',
      'eve',
      'google-genai',
      'langchain',
      'openai',
      'openai-agents-sdk',
      'vercel-ai-sdk',
    ]);
    expect(coreFactoryInput.adapters[0]).toBe(ACTIVE_RUNTIME_ADAPTERS[0]);
    expect(coreFactoryInput.limits).toStrictEqual({
      maxDiagnostics: 32,
      maxEntries: 128,
      maxEvidence: 16,
      maxFileBytes: 4096,
      maxManifestBytes: 2048,
      maxTotalBytesRead: 8192,
    });
    expect(Object.isFrozen(coreFactoryInput.adapters)).toBe(true);
    expect(Object.isFrozen(coreFactoryInput.limits)).toBe(true);
    expect(coreDouble.inspectProject).toHaveBeenCalledWith({
      repository: reader,
      signal: controller.signal,
    });

    await executeInspection({ repository: reader, resourceLimits: RESOURCE_LIMITS });

    expect(coreFactory).toHaveBeenCalledTimes(2);
    expect(ACTIVE_RUNTIME_ADAPTERS.map(({ id }) => id)).toStrictEqual([
      'anthropic',
      'claude-agent-sdk',
      'cloudflare-agents',
      'eve',
      'google-genai',
      'langchain',
      'openai',
      'openai-agents-sdk',
      'vercel-ai-sdk',
    ]);
    expect(Object.isFrozen(ACTIVE_RUNTIME_ADAPTERS)).toBe(true);
    expect(ACTIVE_RUNTIME_ADAPTER_RELEASE_DEFINITIONS).toStrictEqual(
      ACTIVE_RUNTIME_ADAPTERS.map(({ id, supportedRepositoryFormatVersions }) => ({
        id,
        supportedRepositoryFormatVersions,
      })),
    );
  });

  test('normalizes the active package-backed adapter set by ID before Core creation', async () => {
    const reader = createMemoryRepositoryReader([]);
    const coreDouble = createCoreDouble();
    const coreFactory = vi.fn<IMoldeaCliCoreFactory>().mockReturnValue(coreDouble.core);
    const zetaAdapter = createAdapter('zeta');
    const alphaAdapter = createAdapter('alpha');
    const executeInspection = createMoldeaCliCoreInspectionExecutor(coreFactory, [
      zetaAdapter,
      alphaAdapter,
    ]);

    await executeInspection({ repository: reader, resourceLimits: RESOURCE_LIMITS });

    expect(coreFactory.mock.calls[0]?.[0]?.adapters).toStrictEqual([alphaAdapter, zetaAdapter]);
  });
});
