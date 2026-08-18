import { builtinModules } from 'node:module';
import path from 'node:path';

import { defineConfig, type UserConfig } from 'vite';

// supported package runtime targets and shared library-build inputs
export type ILibraryBuildPlatform = 'environment-neutral' | 'node';

export interface ILibraryBuildConfigOptions {
  readonly entry: Readonly<Record<string, string>>;
  readonly externalPackages?: readonly string[];
  readonly isSourceMapEnabled?: boolean;
  readonly platform: ILibraryBuildPlatform;
  readonly rootDirectory: string;
}

const NODE_BUILTIN_MODULES = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

/**
 * Determines whether one import belongs to a declared external package.
 * @param source The import specifier emitted by the package source.
 * @param packageName The package name that must remain external.
 * @returns Whether the import is the package root or one of its public subpaths.
 */
const isPackageImport = (source: string, packageName: string): boolean => {
  return source === packageName || source.startsWith(`${packageName}/`);
};

/**
 * Creates the shared ESM-only Vite configuration used by published package projects.
 * @param options The package-specific entry points, runtime platform, and externals.
 * @returns A Vite library configuration with stable output conventions.
 */
export const createLibraryConfig = (options: ILibraryBuildConfigOptions): UserConfig => {
  const externalPackages = new Set(options.externalPackages ?? []);
  const entry = Object.fromEntries(
    Object.entries(options.entry).map(([entryName, entryPath]) => [
      entryName,
      path.resolve(options.rootDirectory, entryPath),
    ]),
  );

  return defineConfig({
    build: {
      copyPublicDir: false,
      emptyOutDir: false,
      lib: {
        entry,
        formats: ['es'],
      },
      minify: false,
      reportCompressedSize: false,
      rolldownOptions: {
        external: (source) => {
          if (options.platform === 'node' && NODE_BUILTIN_MODULES.has(source)) {
            return true;
          }

          return [...externalPackages].some((packageName) => isPackageImport(source, packageName));
        },
        output: {
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: '[name].js',
        },
      },
      sourcemap: options.isSourceMapEnabled ?? true,
      target: 'es2023',
    },
  });
};
