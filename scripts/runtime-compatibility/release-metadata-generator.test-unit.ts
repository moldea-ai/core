// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

import {
  MOLDEA_CLI_RELEASE_METADATA_PATH,
  RUNTIME_COMPATIBILITY_SOURCE_PATH,
} from './constants.ts';
import { generateMoldeaCliReleaseMetadataModule } from './release-metadata-generator.ts';
import { loadMoldeaCliReleaseMetadata } from './release-metadata-loader.ts';
import type { IMoldeaCliGeneratedReleaseMetadata } from './types.ts';
import { parseRuntimeCompatibilityMatrix } from './validations.ts';

const repositoryRoot = new URL('../../', import.meta.url);

describe('CLI release metadata generation', () => {
  test('matches the committed generated module exactly', async () => {
    const [source, committedModule] = await Promise.all([
      readFile(new URL(RUNTIME_COMPATIBILITY_SOURCE_PATH, repositoryRoot), 'utf8'),
      readFile(new URL(MOLDEA_CLI_RELEASE_METADATA_PATH, repositoryRoot), 'utf8'),
    ]);
    const result = parseRuntimeCompatibilityMatrix(source);

    expect(result.valid).toBe(true);
    if (result.valid) {
      const metadata = await loadMoldeaCliReleaseMetadata(repositoryRoot, result.matrix);

      await expect(generateMoldeaCliReleaseMetadataModule(metadata)).resolves.toBe(committedModule);
    }
  });

  test('orders every generated mapping independently of insertion order', async () => {
    const metadata: IMoldeaCliGeneratedReleaseMetadata = {
      activeAdapterIds: [],
      cliPackage: {
        version: '1.0.0',
        supportedNodeRange: '^24.11.0',
        name: '@moldea.ai/cli',
      },
      coreRecognizedAdapterIds: ['custom'],
      matrix: {
        adapters: {
          custom: {
            implementationStatus: 'planned',
            implementation: {
              package: '@moldea.ai/core',
              kind: 'built-in',
              distribution: 'public',
            },
          },
        },
        version: 1,
      },
      minimumGitVersion: '2.30.0',
      outputSchemaVersion: 1,
      packages: [],
      repositoryFormatVersions: [1],
    };

    const generatedModule = await generateMoldeaCliReleaseMetadataModule(metadata);

    expect(generatedModule.indexOf('distribution:')).toBeLessThan(generatedModule.indexOf('kind:'));
    expect(generatedModule.indexOf('kind:')).toBeLessThan(generatedModule.indexOf('package:'));
    expect(generatedModule.indexOf('name:')).toBeLessThan(
      generatedModule.indexOf('supportedNodeRange:'),
    );
  });
});
