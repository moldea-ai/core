// @vitest-environment node
import {
  execFileSync,
  spawn,
  spawnSync,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';

import { createGitProcessEnvironment } from '../git-process/index.js';

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
  environment: NodeJS.ProcessEnv = process.env,
): SpawnSyncReturns<string> => {
  const isJavaScriptEntrypoint = /\.(?:c|m)?js$/u.test(packageManagerEntrypoint);

  return spawnSync(
    isJavaScriptEntrypoint ? process.execPath : packageManagerEntrypoint,
    isJavaScriptEntrypoint ? [packageManagerEntrypoint, ...commandArguments] : commandArguments,
    { cwd, encoding: 'utf8', env: environment },
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
    semver: '7.8.5',
  });
  expect(manifest).not.toHaveProperty('main');
  expect(manifest).not.toHaveProperty('sideEffects');
  expect(manifest).not.toHaveProperty('types');
};

/** Waits until a process-owned signal fixture is materialized. */
const waitForFixturePath = async (fixturePath: string): Promise<void> => {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if (existsSync(fixturePath)) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error('The signal fixture was not created before the test deadline.');
};

/** Determines whether process-group cleanup raced with normal process exit. */
const isMissingProcessError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH';

/** Spawns the installed CLI, signals its active Git child, and captures process completion. */
const executeInstalledSignalCase = async (
  executablePath: string,
  command: 'inspect' | 'validate',
  signal: 'SIGINT' | 'SIGTERM',
  cwd: string,
  environment: NodeJS.ProcessEnv,
  startedPath: string,
  stoppedPath: string,
): Promise<{ readonly code: number | null; readonly stderr: string; readonly stdout: string }> => {
  const childProcess = spawn(process.execPath, [executablePath, command, '--json'], {
    cwd,
    detached: true,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderrChunks: Buffer[] = [];
  const stdoutChunks: Buffer[] = [];
  let hasClosed = false;
  const closeCompletion = new Promise<number | null>((resolve) => {
    childProcess.once('close', (code) => {
      hasClosed = true;
      resolve(code);
    });
  });
  const processFailure = new Promise<{
    readonly error: Error;
    readonly kind: 'failed';
  }>((resolve) => {
    childProcess.once('error', (error) => resolve({ error, kind: 'failed' }));
  });

  childProcess.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  childProcess.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

  let cleanupFailure: unknown;
  let executionFailure: unknown;
  let executionResult: {
    readonly code: number | null;
    readonly stderr: string;
    readonly stdout: string;
  } | null = null;
  let hasCleanupFailed = false;
  let hasExecutionFailed = false;

  try {
    const startupResult = await Promise.race([
      waitForFixturePath(startedPath).then(() => Object.freeze({ kind: 'started' as const })),
      processFailure,
    ]);

    if (startupResult.kind === 'failed') {
      throw startupResult.error;
    }

    if (!childProcess.kill(signal)) {
      throw new Error('The installed CLI process exited before it could receive the test signal.');
    }

    const completionResult = await Promise.race([
      closeCompletion.then((code) => Object.freeze({ code, kind: 'closed' as const })),
      processFailure,
    ]);

    if (completionResult.kind === 'failed') {
      throw completionResult.error;
    }

    await waitForFixturePath(stoppedPath);

    executionResult = {
      code: completionResult.code,
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    };
  } catch (error) {
    executionFailure = error;
    hasExecutionFailed = true;
  } finally {
    if (!hasClosed && childProcess.pid !== undefined) {
      try {
        process.kill(-childProcess.pid, 'SIGKILL');
      } catch (error) {
        if (!isMissingProcessError(error)) {
          cleanupFailure = error;
          hasCleanupFailed = true;
        }
      }

      await closeCompletion;
    }
  }

  if (hasExecutionFailed && hasCleanupFailed) {
    throw new AggregateError(
      [executionFailure, cleanupFailure],
      'The installed CLI signal case and its cleanup both failed.',
    );
  }

  if (hasExecutionFailed) {
    throw executionFailure;
  }

  if (hasCleanupFailed) {
    throw cleanupFailure;
  }

  if (executionResult === null) {
    throw new Error('The installed CLI signal case did not produce a completion result.');
  }

  return executionResult;
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
    const executable = readFileSync(distributionPath, 'utf8');
    expect(executable.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(executable).toContain('@moldea.ai/adapter-anthropic');
    expect(executable).toContain('minimumGitVersion');
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
      expect(executable).toContain('@moldea.ai/adapter-anthropic');
      expect(executable).toContain('minimumGitVersion');
    } finally {
      rmSync(packDirectory, { force: true, recursive: true });
    }
  });

  test('installs and executes the real CLI and foundational package tarballs', async () => {
    const packageManagerEntrypoint = process.env['npm_execpath'];

    if (packageManagerEntrypoint === undefined) {
      throw new Error('The package-manager entrypoint is unavailable.');
    }

    const testDirectory = mkdtempSync(path.join(tmpdir(), 'moldea-cli-consumer-'));
    const consumerDirectory = path.join(testDirectory, 'consumer');
    const gitHomeDirectory = path.join(testDirectory, 'home');
    const gitConfigDirectory = path.join(testDirectory, 'config');
    const gitHooksDirectory = path.join(testDirectory, 'hooks');
    const gitEnvironment: NodeJS.ProcessEnv = createGitProcessEnvironment({
      ...process.env,
      HOME: gitHomeDirectory,
      XDG_CONFIG_HOME: gitConfigDirectory,
    });

    for (const directory of [
      consumerDirectory,
      gitHomeDirectory,
      gitConfigDirectory,
      gitHooksDirectory,
    ]) {
      mkdirSync(directory, { recursive: true });
    }

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

      const humanCompatibility = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'compatibility'],
        consumerDirectory,
      );

      expect(humanCompatibility.status).toBe(0);
      expect(humanCompatibility.stderr).toBe('');
      expect(humanCompatibility.stdout).toContain(
        'The installed CLI compatibility state is valid.\nCLI version: 0.0.1\n',
      );
      expect(humanCompatibility.stdout).toContain(
        'custom: active=yes, bundled=0.0.1, kind=built-in, package=@moldea.ai/core, status=planned\n',
      );

      const jsonCompatibility = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'compatibility', '--json'],
        consumerDirectory,
      );
      const compatibilityEnvelope = JSON.parse(jsonCompatibility.stdout) as {
        readonly command: string;
        readonly result: {
          readonly adapters: readonly {
            readonly active: boolean;
            readonly bundledVersion: string | null;
            readonly id: string;
          }[];
          readonly packages: readonly { readonly name: string; readonly version: string }[];
        };
        readonly status: string;
      };

      expect(jsonCompatibility.status).toBe(0);
      expect(jsonCompatibility.stderr).toBe('');
      expect(compatibilityEnvelope).toMatchObject({
        command: 'compatibility',
        result: {
          packages: [
            { name: '@moldea.ai/core', version: '0.0.1' },
            { name: '@moldea.ai/repository', version: '0.0.1' },
            { name: '@moldea.ai/repository-fs', version: '0.0.1' },
          ],
        },
        status: 'valid',
      });
      expect(compatibilityEnvelope.result.adapters.find(({ id }) => id === 'custom')).toStrictEqual(
        expect.objectContaining({ active: true, bundledVersion: '0.0.1', id: 'custom' }),
      );

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

      const nonRepositoryCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'inspect', '--json'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(nonRepositoryCommand.status).toBe(3);
      expect(nonRepositoryCommand.stderr).toBe('');
      expect(nonRepositoryCommand.stdout).not.toContain(consumerDirectory);
      expect(nonRepositoryCommand.stdout).toContain('"code":"GIT_REPOSITORY_NOT_FOUND"');

      execFileSync(
        'git',
        ['-c', `core.hooksPath=${gitHooksDirectory}`, '-c', 'init.defaultBranch=main', 'init'],
        {
          cwd: consumerDirectory,
          encoding: 'utf8',
          env: gitEnvironment,
        },
      );
      execFileSync('git', ['config', '--local', 'core.sparseCheckout', 'false'], {
        cwd: consumerDirectory,
        encoding: 'utf8',
        env: gitEnvironment,
      });
      writeFileSync(
        path.join(consumerDirectory, '.gitignore'),
        '*\n!inventory-one.txt\n!inventory-two.txt\n',
        'utf8',
      );
      writeFileSync(path.join(consumerDirectory, 'inventory-one.txt'), 'one', 'utf8');
      writeFileSync(path.join(consumerDirectory, 'inventory-two.txt'), 'two', 'utf8');

      const discoveredRepositoryCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'inspect', '--json'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(discoveredRepositoryCommand.status).toBe(1);
      expect(discoveredRepositoryCommand.stderr).toBe('');
      expect(discoveredRepositoryCommand.stdout).not.toContain(consumerDirectory);
      expect(discoveredRepositoryCommand.stdout).toBe(
        '{"cliVersion":"0.0.1","command":"inspect","error":null,"result":{"inspection":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":"/moldea/moldea.yaml","pointer":null,"range":null,"source":"core"},{"code":"MOLDEA_PROJECT_FILE_MISSING","details":{},"entity":null,"message":"The project file is missing.","path":"/moldea/project.md","pointer":null,"range":null,"source":"core"}],"evidence":[],"formatVersion":null,"project":null,"valid":false},"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
      );

      const invalidValidationCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'validate', '--json'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(invalidValidationCommand.status).toBe(1);
      expect(invalidValidationCommand.stderr).toBe('');
      expect(invalidValidationCommand.stdout).not.toContain(consumerDirectory);
      expect(invalidValidationCommand.stdout).toBe(
        '{"cliVersion":"0.0.1","command":"validate","error":null,"result":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":"/moldea/moldea.yaml","pointer":null,"range":null,"source":"core"},{"code":"MOLDEA_PROJECT_FILE_MISSING","details":{},"entity":null,"message":"The project file is missing.","path":"/moldea/project.md","pointer":null,"range":null,"source":"core"}],"formatVersion":null,"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
      );

      const moldeaDirectory = path.join(consumerDirectory, 'moldea');

      mkdirSync(moldeaDirectory);
      writeFileSync(path.join(moldeaDirectory, 'moldea.yaml'), 'version: 1\n', 'utf8');
      writeFileSync(path.join(moldeaDirectory, 'project.md'), '# Project\n', 'utf8');
      execFileSync('git', ['add', '--force', '--', 'moldea/moldea.yaml', 'moldea/project.md'], {
        cwd: consumerDirectory,
        encoding: 'utf8',
        env: gitEnvironment,
      });

      const validHumanValidationCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'validate'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(validHumanValidationCommand.status).toBe(0);
      expect(validHumanValidationCommand.stderr).toBe('');
      expect(validHumanValidationCommand.stdout).toBe(
        'The moldea project is valid.\nRepository format: 1\n',
      );

      const validJsonValidationCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'validate', '--json'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(validJsonValidationCommand.status).toBe(0);
      expect(validJsonValidationCommand.stderr).toBe('');
      expect(validJsonValidationCommand.stdout).toBe(
        '{"cliVersion":"0.0.1","command":"validate","error":null,"result":{"diagnostics":[],"formatVersion":1,"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"valid"}\n',
      );

      const validHumanInspectionCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'inspect'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(validHumanInspectionCommand.status).toBe(0);
      expect(validHumanInspectionCommand.stderr).toBe('');
      expect(validHumanInspectionCommand.stdout).toBe(
        `The moldea project is valid.
Repository format: 1
Context assets: 0
Decisions: 0
Runtime-guidance assets: 0
Agents: 0
Mirrors: 0
Adapter evidence items: 0
`,
      );

      const validJsonInspectionCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'inspect', '--json'],
        consumerDirectory,
        gitEnvironment,
      );
      const validInspectionEnvelope = JSON.parse(validJsonInspectionCommand.stdout) as {
        readonly result: {
          readonly inspection: {
            readonly diagnostics: readonly unknown[];
            readonly evidence: readonly unknown[];
            readonly formatVersion: number | null;
            readonly project: {
              readonly agents: readonly unknown[];
              readonly context: readonly unknown[];
              readonly decisions: readonly unknown[];
              readonly project: { readonly content: string; readonly path: string };
              readonly runtimes: readonly unknown[];
            } | null;
            readonly valid: boolean;
          };
          readonly source: { readonly kind: string };
        };
        readonly status: string;
      };

      expect(validJsonInspectionCommand.status).toBe(0);
      expect(validJsonInspectionCommand.stderr).toBe('');
      expect(validInspectionEnvelope).toMatchObject({
        cliVersion: '0.0.1',
        command: 'inspect',
        error: null,
        result: {
          inspection: {
            diagnostics: [],
            evidence: [],
            formatVersion: 1,
            project: {
              agents: [],
              context: [],
              decisions: [],
              project: { content: '# Project\n', path: '/moldea/project.md' },
              runtimes: [],
            },
            valid: true,
          },
          source: { kind: 'git-working-tree' },
        },
        schemaVersion: 1,
        status: 'valid',
      });
      expect(Object.keys(validInspectionEnvelope.result.inspection)).toStrictEqual([
        'diagnostics',
        'evidence',
        'formatVersion',
        'project',
        'valid',
      ]);
      expect(validInspectionEnvelope.result.inspection.project).not.toBeNull();

      const inventoryLimitCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'inspect', '--json', '--max-entries', '1'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(inventoryLimitCommand.status).toBe(3);
      expect(inventoryLimitCommand.stderr).toBe('');
      expect(inventoryLimitCommand.stdout).toBe(
        '{"cliVersion":"0.0.1","command":"inspect","error":{"code":"RESOURCE_LIMIT_EXCEEDED","details":{},"message":"A resource limit was exceeded.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
      );

      const installedExecutablePath = path.join(
        consumerDirectory,
        'node_modules',
        '@moldea.ai',
        'cli',
        'dist',
        'moldea.js',
      );
      const environmentWithoutPath = Object.fromEntries(
        Object.entries(gitEnvironment).filter(([name]) => name.toUpperCase() !== 'PATH'),
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

      const compatibilityWithoutGit = spawnSync(
        process.execPath,
        [installedExecutablePath, 'compatibility', '--json'],
        {
          cwd: consumerDirectory,
          encoding: 'utf8',
          env: {
            ...environmentWithoutPath,
            PATH: path.join(consumerDirectory, 'missing-executables'),
          },
        },
      );

      expect(compatibilityWithoutGit.status).toBe(0);
      expect(compatibilityWithoutGit.stderr).toBe('');
      expect(JSON.parse(compatibilityWithoutGit.stdout)).toMatchObject({
        command: 'compatibility',
        status: 'valid',
      });

      if (process.platform !== 'win32') {
        const fakeGitDirectory = path.join(testDirectory, 'fake-git');
        const fakeGitPath = path.join(fakeGitDirectory, 'git');

        mkdirSync(fakeGitDirectory);
        writeFileSync(
          fakeGitPath,
          `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
writeFileSync(process.env.MOLDEA_TEST_GIT_STARTED, 'started');
process.on('SIGTERM', () => {
  writeFileSync(process.env.MOLDEA_TEST_GIT_STOPPED, 'stopped');
  process.exit(0);
});
setInterval(() => undefined, 1000);
`,
          'utf8',
        );
        chmodSync(fakeGitPath, 0o755);

        for (const [command, signal, exitCode] of [
          ['validate', 'SIGINT', 130],
          ['inspect', 'SIGTERM', 143],
        ] as const) {
          const startedPath = path.join(testDirectory, `${command}-git-started`);
          const stoppedPath = path.join(testDirectory, `${command}-git-stopped`);
          const signalResult = await executeInstalledSignalCase(
            installedExecutablePath,
            command,
            signal,
            consumerDirectory,
            {
              ...gitEnvironment,
              MOLDEA_TEST_GIT_STARTED: startedPath,
              MOLDEA_TEST_GIT_STOPPED: stoppedPath,
              PATH: `${fakeGitDirectory}${path.delimiter}${gitEnvironment['PATH'] ?? ''}`,
            },
            startedPath,
            stoppedPath,
          );

          expect(signalResult).toStrictEqual({ code: exitCode, stderr: '', stdout: '' });
        }
      }

      const installedCoreManifestPath = path.join(
        consumerDirectory,
        'node_modules',
        '@moldea.ai',
        'core',
        'package.json',
      );
      const installedCoreManifest = JSON.parse(
        readFileSync(installedCoreManifestPath, 'utf8'),
      ) as IMoldeaCliPackageManifest;
      const mismatchedCoreManifestPath = `${installedCoreManifestPath}.moldea-test`;

      writeFileSync(
        mismatchedCoreManifestPath,
        `${JSON.stringify({ ...installedCoreManifest, version: '0.0.2' }, null, 2)}\n`,
        'utf8',
      );
      renameSync(mismatchedCoreManifestPath, installedCoreManifestPath);

      const mismatchedDependencyResult = spawnSync(
        process.execPath,
        [installedExecutablePath, 'compatibility', '--json'],
        {
          cwd: consumerDirectory,
          encoding: 'utf8',
          env: {
            ...environmentWithoutPath,
            PATH: path.join(consumerDirectory, 'missing-executables'),
          },
        },
      );

      expect(mismatchedDependencyResult.status).toBe(3);
      expect(mismatchedDependencyResult.stderr).toBe('');
      expect(JSON.parse(mismatchedDependencyResult.stdout)).toMatchObject({
        command: 'compatibility',
        error: { code: 'COMPATIBILITY_STATE_INVALID' },
        result: null,
        status: 'error',
      });
    } finally {
      rmSync(testDirectory, { force: true, recursive: true });
    }
  }, 30_000);
});
