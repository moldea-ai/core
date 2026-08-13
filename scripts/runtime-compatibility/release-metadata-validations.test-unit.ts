// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { satisfies } from 'semver';

import { OFFICIAL_RUNTIME_ADAPTER_PACKAGES } from './constants.ts';
import { createMoldeaCliReleaseMetadata } from './release-metadata-validations.ts';
import type {
  IMoldeaCliReleaseMetadataSources,
  IRuntimeAdapterEntry,
  IRuntimeCompatibilityMatrix,
} from './types.ts';

const FOUNDATIONAL_DEPENDENCIES = {
  '@moldea.ai/core': 'workspace:1.0.0',
  '@moldea.ai/repository': 'workspace:1.0.0',
  '@moldea.ai/repository-fs': 'workspace:1.0.0',
};

const createPlannedMatrix = (): IRuntimeCompatibilityMatrix => ({
  adapters: Object.fromEntries(
    Object.entries(OFFICIAL_RUNTIME_ADAPTER_PACKAGES).map(([adapterId, packageName]) => [
      adapterId,
      {
        implementation: {
          distribution: 'public',
          kind: adapterId === 'custom' ? 'built-in' : 'package',
          package: packageName,
        },
        implementationStatus: 'planned',
      },
    ]),
  ),
  version: 1,
});

const createSources = (): IMoldeaCliReleaseMetadataSources => ({
  activeAdapters: [],
  cliManifest: {
    dependencies: { ...FOUNDATIONAL_DEPENDENCIES },
    engines: { node: '^22.11.0 || ^24.11.0' },
    name: '@moldea.ai/cli',
    version: '1.0.0',
  },
  coreRecognizedAdapterIds: Object.keys(OFFICIAL_RUNTIME_ADAPTER_PACKAGES),
  coreSupportedRepositoryFormatVersions: [1],
  matrix: createPlannedMatrix(),
  minimumGitVersion: '2.30.0',
  outputSchemaVersion: 1,
  packageManifests: {
    '@moldea.ai/core': { name: '@moldea.ai/core', version: '1.0.0' },
    '@moldea.ai/repository': { name: '@moldea.ai/repository', version: '1.0.0' },
    '@moldea.ai/repository-fs': { name: '@moldea.ai/repository-fs', version: '1.0.0' },
  },
});

const AVAILABLE_OPENAI_ENTRY: IRuntimeAdapterEntry = {
  compatibleCoreRange: '^1.0.0',
  implementation: {
    distribution: 'public',
    kind: 'package',
    package: '@moldea.ai/adapter-openai',
    versionRange: '^1.0.0',
  },
  implementationStatus: 'available',
  lastVerifiedAt: '2026-08-13',
  runtimeGuidance: { expectation: 'optional' },
  supportedRepositoryFormatVersions: [1],
  targets: [
    {
      id: 'typescript',
      kind: 'package',
      language: 'typescript',
      lastVerifiedAt: '2026-08-13',
      packages: [
        {
          ecosystem: 'npm',
          name: 'openai',
          role: 'primary',
          versionRange: '^1.0.0',
        },
      ],
      supportLevel: 'supported',
    },
  ],
};

const AVAILABLE_CUSTOM_ENTRY: IRuntimeAdapterEntry = {
  compatibleCoreRange: '^1.0.0',
  implementation: {
    distribution: 'public',
    kind: 'built-in',
    package: '@moldea.ai/core',
  },
  implementationStatus: 'available',
  lastVerifiedAt: '2026-08-13',
  runtimeGuidance: { expectation: 'optional' },
  supportedRepositoryFormatVersions: [1],
  targets: [
    {
      id: 'custom',
      kind: 'custom',
      language: 'custom',
      lastVerifiedAt: '2026-08-13',
      supportLevel: 'supported',
    },
  ],
};

const activateOpenAi = (
  sources: IMoldeaCliReleaseMetadataSources,
): IMoldeaCliReleaseMetadataSources => {
  sources.matrix.adapters['openai'] = AVAILABLE_OPENAI_ENTRY;
  const cliManifest = sources.cliManifest as {
    dependencies: Record<string, string>;
  };
  cliManifest.dependencies['@moldea.ai/adapter-openai'] = 'workspace:1.0.0';
  return {
    ...sources,
    activeAdapters: [{ id: 'openai', supportedRepositoryFormatVersions: [1] }],
    packageManifests: {
      ...sources.packageManifests,
      '@moldea.ai/adapter-openai': {
        name: '@moldea.ai/adapter-openai',
        version: '1.0.0',
      },
    },
  };
};

describe('CLI release metadata validation', () => {
  test('creates exact sorted metadata for the current planned composition', () => {
    const metadata = createMoldeaCliReleaseMetadata(createSources());

    expect(metadata).toStrictEqual({
      activeAdapterIds: [],
      cliPackage: {
        name: '@moldea.ai/cli',
        supportedNodeRange: '^22.11.0 || ^24.11.0',
        version: '1.0.0',
      },
      coreRecognizedAdapterIds: Object.keys(OFFICIAL_RUNTIME_ADAPTER_PACKAGES),
      matrix: createPlannedMatrix(),
      minimumGitVersion: '2.30.0',
      outputSchemaVersion: 1,
      packages: [
        { name: '@moldea.ai/core', version: '1.0.0' },
        { name: '@moldea.ai/repository', version: '1.0.0' },
        { name: '@moldea.ai/repository-fs', version: '1.0.0' },
      ],
      repositoryFormatVersions: [1],
    });
  });

  test.each([
    ['22.11.0', true],
    ['22.99.0', true],
    ['24.11.0', true],
    ['24.99.0', true],
    ['22.10.9', false],
    ['23.0.0', false],
    ['24.10.9', false],
    ['25.0.0', false],
    ['26.0.0', false],
  ])('publishes the intended Node.js runtime boundary for %s -> %s', (version, isSupported) => {
    const metadata = createMoldeaCliReleaseMetadata(createSources());

    expect(satisfies(version, metadata.cliPackage.supportedNodeRange)).toBe(isSupported);
  });

  test('accepts one available adapter only when package and runtime composition agree', () => {
    const sources = activateOpenAi(createSources());

    const metadata = createMoldeaCliReleaseMetadata(sources);

    expect(metadata.activeAdapterIds).toStrictEqual(['openai']);
    expect(metadata.packages).toContainEqual({
      name: '@moldea.ai/adapter-openai',
      version: '1.0.0',
    });
  });

  test('rejects an adapter inventory that differs from Core', () => {
    const baseSources = createSources();
    const sources = {
      ...baseSources,
      coreRecognizedAdapterIds: baseSources.coreRecognizedAdapterIds.slice(1),
    };

    expect(() => createMoldeaCliReleaseMetadata(sources)).toThrow(
      'The Core and matrix adapter inventory is inconsistent.',
    );
  });

  test.each([
    [
      'non-exact Core dependency',
      (sources: IMoldeaCliReleaseMetadataSources): void => {
        const cliManifest = sources.cliManifest as { dependencies: Record<string, string> };
        cliManifest.dependencies['@moldea.ai/core'] = 'workspace:^1.0.0';
      },
      'The @moldea.ai/core CLI dependency is not pinned to its exact version.',
    ],
    [
      'missing Repository dependency',
      (sources: IMoldeaCliReleaseMetadataSources): void => {
        const cliManifest = sources.cliManifest as { dependencies: Record<string, string> };
        delete cliManifest.dependencies['@moldea.ai/repository'];
      },
      'The CLI first-class dependency set is inconsistent.',
    ],
    [
      'unexpected first-class dependency',
      (sources: IMoldeaCliReleaseMetadataSources): void => {
        const cliManifest = sources.cliManifest as { dependencies: Record<string, string> };
        cliManifest.dependencies['@moldea.ai/unexpected'] = 'workspace:1.0.0';
      },
      'The CLI first-class dependency set is inconsistent.',
    ],
    [
      'invalid Node.js range',
      (sources: IMoldeaCliReleaseMetadataSources): void => {
        const cliManifest = sources.cliManifest as { engines: Record<string, string> };
        cliManifest.engines['node'] = 'not a range';
      },
      'The CLI Node.js engine range is invalid.',
    ],
  ])('rejects an invalid foundational release contract: %s', (_, mutate, expectedMessage) => {
    const sources = createSources();
    mutate(sources);

    expect(() => createMoldeaCliReleaseMetadata(sources)).toThrow(expectedMessage);
  });

  test('rejects an available adapter that is absent from the CLI composition', () => {
    const sources = createSources();
    sources.matrix.adapters['openai'] = AVAILABLE_OPENAI_ENTRY;

    expect(() => createMoldeaCliReleaseMetadata(sources)).toThrow(
      'The available openai adapter is not active in the CLI release.',
    );
  });

  test('validates built-in custom compatibility against the bundled Core release', () => {
    const sources = createSources();
    sources.matrix.adapters['custom'] = AVAILABLE_CUSTOM_ENTRY;

    expect(createMoldeaCliReleaseMetadata(sources).activeAdapterIds).toStrictEqual([]);

    expect(() =>
      createMoldeaCliReleaseMetadata({
        ...sources,
        coreSupportedRepositoryFormatVersions: [1, 2],
      }),
    ).toThrow('The custom adapter repository-format support is inconsistent.');
  });

  test('rejects activation of a planned adapter', () => {
    const baseSources = createSources();
    const sources = {
      ...baseSources,
      activeAdapters: [{ id: 'openai', supportedRepositoryFormatVersions: [1] }],
    };
    const cliManifest = sources.cliManifest as { dependencies: Record<string, string> };
    cliManifest.dependencies['@moldea.ai/adapter-openai'] = 'workspace:1.0.0';

    expect(() => createMoldeaCliReleaseMetadata(sources)).toThrow(
      'The openai adapter cannot be active while unpublished.',
    );
  });

  test.each([
    [
      'workspace:^1.0.0',
      'The @moldea.ai/adapter-openai CLI dependency is not pinned to its exact version.',
      undefined,
      undefined,
    ],
    [
      'workspace:0.0.2',
      'The @moldea.ai/adapter-openai CLI dependency is not pinned to its exact version.',
      undefined,
      undefined,
    ],
    [
      'workspace:1.0.0',
      'The @moldea.ai/adapter-openai version is outside its matrix implementation range.',
      '^2.0.0',
      undefined,
    ],
    [
      'workspace:1.0.0',
      'The @moldea.ai/adapter-openai Core compatibility range is inconsistent.',
      undefined,
      '^2.0.0',
    ],
  ])(
    'rejects inconsistent active adapter release metadata for %s -> %s',
    (dependencyVersion, expectedMessage, versionRange, compatibleCoreRange) => {
      const sources = activateOpenAi(createSources());
      const cliManifest = sources.cliManifest as { dependencies: Record<string, string> };
      cliManifest.dependencies['@moldea.ai/adapter-openai'] = dependencyVersion;
      sources.matrix.adapters['openai'] = {
        ...AVAILABLE_OPENAI_ENTRY,
        ...(compatibleCoreRange === undefined ? {} : { compatibleCoreRange }),
        implementation: {
          ...AVAILABLE_OPENAI_ENTRY.implementation,
          ...(versionRange === undefined ? {} : { versionRange }),
        },
      };

      expect(() => createMoldeaCliReleaseMetadata(sources)).toThrow(expectedMessage);
    },
  );

  test('rejects adapter repository-format support that differs from registration', () => {
    const sources = {
      ...activateOpenAi(createSources()),
      activeAdapters: [{ id: 'openai', supportedRepositoryFormatVersions: [1, 2] }],
    };

    expect(() => createMoldeaCliReleaseMetadata(sources)).toThrow(
      'The openai adapter repository-format support is inconsistent.',
    );
  });

  test('rejects an active adapter format version unsupported by Core', () => {
    const sources = activateOpenAi(createSources());
    sources.matrix.adapters['openai'] = {
      ...AVAILABLE_OPENAI_ENTRY,
      supportedRepositoryFormatVersions: [2],
    };

    expect(() =>
      createMoldeaCliReleaseMetadata({
        ...sources,
        activeAdapters: [{ id: 'openai', supportedRepositoryFormatVersions: [2] }],
      }),
    ).toThrow('The openai adapter declares a Core-unsupported format version.');
  });
});
