// @vitest-environment node
import {
  execFileSync,
  spawnSync,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';

const projectDirectory = path.resolve(import.meta.dirname, '..', '..');
const projectsDirectory = path.dirname(projectDirectory);
const coreProjectDirectory = path.join(projectsDirectory, 'core');
const repositoryProjectDirectory = path.join(projectsDirectory, 'repository');
const repositoryFilesystemProjectDirectory = path.join(projectsDirectory, 'repository-fs');
const distributionPath = path.join(projectDirectory, 'dist', 'moldea.js');

interface IPackDryRunResult {
  readonly files: readonly { readonly path: string }[];
  readonly name: string;
  readonly version: string;
}

interface IMoldeaCliPackageManifest {
  readonly bin?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
  readonly files?: readonly string[];
  readonly main?: string;
  readonly name?: string;
  readonly sideEffects?: boolean;
  readonly type?: string;
  readonly types?: string;
  readonly version?: string;
}

/** Executes native or JavaScript package-manager entrypoints without a platform shell. */
const runPackageManager = (
  packageManagerEntrypoint: string,
  commandArguments: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string => {
  const isJavaScriptEntrypoint = /\.(?:c|m)?js$/u.test(packageManagerEntrypoint);

  return execFileSync(
    isJavaScriptEntrypoint ? process.execPath : packageManagerEntrypoint,
    isJavaScriptEntrypoint ? [packageManagerEntrypoint, ...commandArguments] : commandArguments,
    options,
  );
};

/** Spawns a package-manager command and retains nonzero handled CLI results. */
const spawnPackageManager = (
  packageManagerEntrypoint: string,
  commandArguments: readonly string[],
  cwd: string,
): SpawnSyncReturns<string> => {
  const isJavaScriptEntrypoint = /\.(?:c|m)?js$/u.test(packageManagerEntrypoint);

  return spawnSync(
    isJavaScriptEntrypoint ? process.execPath : packageManagerEntrypoint,
    isJavaScriptEntrypoint ? [packageManagerEntrypoint, ...commandArguments] : commandArguments,
    { cwd, encoding: 'utf8' },
  );
};

/** Packs one project and returns the single newly created tarball name. */
const packPackageTarball = (
  packageManagerEntrypoint: string,
  packageDirectory: string,
  packDirectory: string,
): string => {
  const existingFiles = new Set(readdirSync(packDirectory));

  runPackageManager(packageManagerEntrypoint, ['pack', '--pack-destination', packDirectory], {
    cwd: packageDirectory,
    encoding: 'utf8',
  });
  const tarballNames = readdirSync(packDirectory).filter(
    (fileName) => fileName.endsWith('.tgz') && !existingFiles.has(fileName),
  );

  if (tarballNames.length !== 1 || tarballNames[0] === undefined) {
    throw new Error('The package tarball was not created deterministically.');
  }

  return tarballNames[0];
};

/** Reads one regular entry from an uncompressed USTAR-compatible package archive. */
const readTarEntry = (tarball: Buffer, entryPath: string): Buffer => {
  const archive = gunzipSync(tarball);
  let offset = 0;

  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    const nameEnd = header.indexOf(0);

    if (nameEnd === 0) {
      break;
    }

    const name = header.subarray(0, nameEnd).toString('utf8');
    const sizeText = header.subarray(124, 136).toString('ascii').replaceAll('\0', '').trim();
    const size = Number.parseInt(sizeText, 8);
    const contentOffset = offset + 512;

    if (name === entryPath) {
      return archive.subarray(contentOffset, contentOffset + size);
    }

    offset = contentOffset + Math.ceil(size / 512) * 512;
  }

  throw new Error(`The packed archive does not contain ${entryPath}.`);
};

/** Asserts exact source or packed CLI metadata and its deliberate closed import surface. */
const expectPackageManifest = (
  manifest: IMoldeaCliPackageManifest,
  dependencyVersion: string,
): void => {
  expect(manifest).toMatchObject({
    bin: { moldea: './dist/moldea.js' },
    engines: { node: '^22.11.0 || ^24.11.0' },
    exports: {},
    files: ['dist', 'LICENSE', 'README.md'],
    name: '@moldea.ai/cli',
    type: 'module',
    version: '0.0.1',
  });
  expect(manifest.dependencies).toStrictEqual({
    '@moldea.ai/core': dependencyVersion,
    '@moldea.ai/repository': dependencyVersion,
    '@moldea.ai/repository-fs': dependencyVersion,
  });
  expect(manifest).not.toHaveProperty('main');
  expect(manifest).not.toHaveProperty('sideEffects');
  expect(manifest).not.toHaveProperty('types');
};

describe('published CLI package and executable', () => {
  test('packs only the executable package surface and exact metadata', () => {
    const packageManagerEntrypoint = process.env['npm_execpath'];

    if (packageManagerEntrypoint === undefined) {
      throw new Error('The package-manager entrypoint is unavailable.');
    }

    const output = runPackageManager(packageManagerEntrypoint, ['pack', '--dry-run', '--json'], {
      cwd: projectDirectory,
      encoding: 'utf8',
    });
    const packResult = JSON.parse(output) as IPackDryRunResult;
    const manifest = JSON.parse(
      readFileSync(path.join(projectDirectory, 'package.json'), 'utf8'),
    ) as IMoldeaCliPackageManifest;
    const packedPaths = packResult.files.map((file) => file.path);

    expect(packResult).toMatchObject({ name: '@moldea.ai/cli', version: '0.0.1' });
    expect(packedPaths).toContain('dist/moldea.js');
    expect(packedPaths).toContain('LICENSE');
    expect(packedPaths).toContain('README.md');
    expect(packedPaths).toContain('package.json');
    expect(
      packedPaths.every(
        (filePath) =>
          filePath.startsWith('dist/') ||
          filePath === 'LICENSE' ||
          filePath === 'README.md' ||
          filePath === 'package.json',
      ),
    ).toBe(true);
    expect(packedPaths.every((filePath) => !filePath.includes('.test-'))).toBe(true);
    expectPackageManifest(manifest, 'workspace:0.0.1');
    expect(readFileSync(distributionPath, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
  });

  test('rewrites exact workspace dependencies in the real tarball', () => {
    const packageManagerEntrypoint = process.env['npm_execpath'];

    if (packageManagerEntrypoint === undefined) {
      throw new Error('The package-manager entrypoint is unavailable.');
    }

    const packDirectory = mkdtempSync(path.join(tmpdir(), 'moldea-cli-pack-'));

    try {
      const tarballName = packPackageTarball(
        packageManagerEntrypoint,
        projectDirectory,
        packDirectory,
      );
      const tarball = readFileSync(path.join(packDirectory, tarballName));
      const manifest = JSON.parse(
        readTarEntry(tarball, 'package/package.json').toString('utf8'),
      ) as IMoldeaCliPackageManifest;
      const executable = readTarEntry(tarball, 'package/dist/moldea.js').toString('utf8');

      expectPackageManifest(manifest, '0.0.1');
      expect(executable.startsWith('#!/usr/bin/env node\n')).toBe(true);
    } finally {
      rmSync(packDirectory, { force: true, recursive: true });
    }
  });

  test('installs and executes the real CLI and foundational package tarballs', () => {
    const packageManagerEntrypoint = process.env['npm_execpath'];

    if (packageManagerEntrypoint === undefined) {
      throw new Error('The package-manager entrypoint is unavailable.');
    }

    const consumerDirectory = mkdtempSync(path.join(tmpdir(), 'moldea-cli-consumer-'));

    try {
      const repositoryTarballName = packPackageTarball(
        packageManagerEntrypoint,
        repositoryProjectDirectory,
        consumerDirectory,
      );
      const repositoryFilesystemTarballName = packPackageTarball(
        packageManagerEntrypoint,
        repositoryFilesystemProjectDirectory,
        consumerDirectory,
      );
      const coreTarballName = packPackageTarball(
        packageManagerEntrypoint,
        coreProjectDirectory,
        consumerDirectory,
      );
      const cliTarballName = packPackageTarball(
        packageManagerEntrypoint,
        projectDirectory,
        consumerDirectory,
      );
      const packageTarballs = {
        '@moldea.ai/cli': `file:./${cliTarballName}`,
        '@moldea.ai/core': `file:./${coreTarballName}`,
        '@moldea.ai/repository': `file:./${repositoryTarballName}`,
        '@moldea.ai/repository-fs': `file:./${repositoryFilesystemTarballName}`,
      };

      writeFileSync(
        path.join(consumerDirectory, 'package.json'),
        `${JSON.stringify(
          {
            dependencies: packageTarballs,
            name: 'moldea-cli-tarball-consumer',
            private: true,
            type: 'module',
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      writeFileSync(
        path.join(consumerDirectory, 'pnpm-workspace.yaml'),
        `packages:\n  - .\noverrides:\n${Object.entries(packageTarballs)
          .map(([packageName, tarball]) => `  '${packageName}': ${tarball}`)
          .join('\n')}\n`,
        'utf8',
      );
      runPackageManager(
        packageManagerEntrypoint,
        ['install', '--ignore-scripts', '--prefer-offline'],
        {
          cwd: consumerDirectory,
          encoding: 'utf8',
          env: { ...process.env, CI: 'true' },
        },
      );

      expect(existsSync(path.join(consumerDirectory, 'node_modules', '.bin', 'moldea'))).toBe(true);
      expect(
        runPackageManager(packageManagerEntrypoint, ['exec', 'moldea', '--version'], {
          cwd: consumerDirectory,
          encoding: 'utf8',
        }),
      ).toBe('0.0.1\n');
      expect(
        runPackageManager(packageManagerEntrypoint, ['exec', 'moldea', '--help'], {
          cwd: consumerDirectory,
          encoding: 'utf8',
        }),
      ).toContain('Usage: moldea <command> [options]\n');

      const jsonUsageFailure = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', '--json'],
        consumerDirectory,
      );

      expect(jsonUsageFailure.status).toBe(2);
      expect(jsonUsageFailure.stderr).toBe('');
      expect(jsonUsageFailure.stdout).toBe(
        '{"cliVersion":"0.0.1","command":null,"error":{"code":"INVALID_ARGUMENT","details":{},"message":"The command invocation is invalid.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
      );

      const unavailableCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'inspect', '--json'],
        consumerDirectory,
      );

      expect(unavailableCommand.status).toBe(3);
      expect(unavailableCommand.stderr).toBe('');
      expect(unavailableCommand.stdout).not.toContain(consumerDirectory);
      expect(unavailableCommand.stdout).toContain('"code":"INTERNAL_ERROR"');

      const installedExecutablePath = path.join(
        consumerDirectory,
        'node_modules',
        '@moldea.ai',
        'cli',
        'dist',
        'moldea.js',
      );
      const environmentWithoutPath = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH'),
      );
      const missingGitResult = spawnSync(
        process.execPath,
        [installedExecutablePath, 'validate', '--json'],
        {
          cwd: consumerDirectory,
          encoding: 'utf8',
          env: {
            ...environmentWithoutPath,
            PATH: path.join(consumerDirectory, 'missing-executables'),
          },
        },
      );

      expect(missingGitResult.status).toBe(3);
      expect(missingGitResult.stderr).toBe('');
      expect(missingGitResult.stdout).toBe(
        '{"cliVersion":"0.0.1","command":"validate","error":{"code":"GIT_NOT_FOUND","details":{},"message":"The Git executable is unavailable.","path":null,"retryable":false,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
      );
    } finally {
      rmSync(consumerDirectory, { force: true, recursive: true });
    }
  }, 30_000);
});
