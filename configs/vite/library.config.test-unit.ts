// @vitest-environment node
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLibraryConfig } from './library.config.js';

const requireExternalPredicate = (config: ReturnType<typeof createLibraryConfig>) => {
  const external = config.build?.rolldownOptions?.external;

  if (typeof external !== 'function') {
    throw new TypeError('Expected the shared Vite config to define an external predicate.');
  }

  return external;
};

describe('createLibraryConfig', () => {
  it('creates stable ESM library output without clearing declaration artifacts', () => {
    const rootDirectory = path.resolve('fixtures/example-package');
    const config = createLibraryConfig({
      entry: {
        index: 'src/index.ts',
      },
      platform: 'environment-neutral',
      rootDirectory,
    });

    expect(config.build).toMatchObject({
      copyPublicDir: false,
      emptyOutDir: false,
      lib: {
        entry: {
          index: path.resolve(rootDirectory, 'src/index.ts'),
        },
        formats: ['es'],
      },
      minify: false,
      reportCompressedSize: false,
      sourcemap: true,
      target: 'es2023',
    });
    expect(config.build?.rolldownOptions?.output).toMatchObject({
      chunkFileNames: 'chunks/[name]-[hash].js',
      entryFileNames: '[name].js',
    });
  });

  it('externalizes declared package roots and subpaths only', () => {
    const config = createLibraryConfig({
      entry: { index: 'src/index.ts' },
      externalPackages: ['@moldea.ai/repository'],
      platform: 'environment-neutral',
      rootDirectory: import.meta.dirname,
    });
    const external = requireExternalPredicate(config);

    expect(external('@moldea.ai/repository', undefined, false)).toBe(true);
    expect(external('@moldea.ai/repository/testing', undefined, false)).toBe(true);
    expect(external('@moldea.ai/repository-extra', undefined, false)).toBe(false);
    expect(external('node:fs', undefined, false)).toBe(false);
  });

  it('externalizes Node.js built-ins for Node-specific packages', () => {
    const config = createLibraryConfig({
      entry: { index: 'src/index.ts' },
      platform: 'node',
      rootDirectory: import.meta.dirname,
    });
    const external = requireExternalPredicate(config);

    expect(external('fs', undefined, false)).toBe(true);
    expect(external('node:fs', undefined, false)).toBe(true);
    expect(external('not-a-node-builtin', undefined, false)).toBe(false);
  });
});
