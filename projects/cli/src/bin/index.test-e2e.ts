// @vitest-environment node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { createGitProcessEnvironment } from '../git-process/index.js';

import {
  ADAPTER_ANTHROPIC_PROJECT_DIRECTORY,
  ADAPTER_GOOGLE_GENAI_PROJECT_DIRECTORY,
  ADAPTER_OPENAI_PROJECT_DIRECTORY,
  CLI_DISTRIBUTION_PATH,
  CLI_PROJECT_DIRECTORY,
  CORE_PROJECT_DIRECTORY,
  expectPackageManifest,
  type IMoldeaCliPackageManifest,
  type IPackDryRunResult,
  packPackageTarball,
  readCliPackageManifest,
  readTarEntry,
  REPOSITORY_FILESYSTEM_PROJECT_DIRECTORY,
  REPOSITORY_PROJECT_DIRECTORY,
  runPackageManager,
  spawnPackageManager,
} from './index.test-fixtures.js';

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
      cwd: CLI_PROJECT_DIRECTORY,
      encoding: 'utf8',
    });
    const packResult = JSON.parse(output) as IPackDryRunResult;
    const manifest = readCliPackageManifest();
    const packedPaths = packResult.files.map((file) => file.path);

    expect(packResult).toMatchObject({ name: '@moldea.ai/cli', version: '3.1.2' });
    expect(packedPaths).toContain('dist/moldea.js');
    expect(packedPaths).toContain('LICENSE');
    expect(packedPaths).toContain('README.md');
    expect(packedPaths).toContain('cover.png');
    expect(packedPaths).toContain('package.json');
    expect(
      packedPaths.every(
        (filePath) =>
          filePath.startsWith('dist/') ||
          filePath === 'LICENSE' ||
          filePath === 'README.md' ||
          filePath === 'cover.png' ||
          filePath === 'package.json',
      ),
    ).toBe(true);
    expect(packedPaths.every((filePath) => !filePath.includes('.test-'))).toBe(true);
    expectPackageManifest(
      manifest,
      'workspace:2.0.0',
      'workspace:2.0.1',
      'workspace:1.0.2',
      'workspace:2.0.3',
      'workspace:1.0.1',
      'workspace:1.0.2',
    );
    const executable = readFileSync(CLI_DISTRIBUTION_PATH, 'utf8');
    expect(executable.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(executable).toContain('@moldea.ai/adapter-openai');
    expect(executable).toContain('@moldea.ai/adapter-anthropic');
    expect(executable).toContain('@moldea.ai/adapter-google-genai');
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
        CLI_PROJECT_DIRECTORY,
        packDirectory,
      );
      const tarball = readFileSync(path.join(packDirectory, tarballName));
      const manifest = JSON.parse(
        readTarEntry(tarball, 'package/package.json').toString('utf8'),
      ) as IMoldeaCliPackageManifest;
      const executable = readTarEntry(tarball, 'package/dist/moldea.js').toString('utf8');

      expectPackageManifest(manifest, '2.0.0', '2.0.1', '1.0.2', '2.0.3', '1.0.1', '1.0.2');
      expect(executable.startsWith('#!/usr/bin/env node\n')).toBe(true);
      expect(executable).toContain('@moldea.ai/adapter-openai');
      expect(executable).toContain('@moldea.ai/adapter-anthropic');
      expect(executable).toContain('@moldea.ai/adapter-google-genai');
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
        REPOSITORY_PROJECT_DIRECTORY,
        consumerDirectory,
      );
      const repositoryFilesystemTarballName = packPackageTarball(
        packageManagerEntrypoint,
        REPOSITORY_FILESYSTEM_PROJECT_DIRECTORY,
        consumerDirectory,
      );
      const coreTarballName = packPackageTarball(
        packageManagerEntrypoint,
        CORE_PROJECT_DIRECTORY,
        consumerDirectory,
      );
      const adapterAnthropicTarballName = packPackageTarball(
        packageManagerEntrypoint,
        ADAPTER_ANTHROPIC_PROJECT_DIRECTORY,
        consumerDirectory,
      );
      const adapterGoogleGenAiTarballName = packPackageTarball(
        packageManagerEntrypoint,
        ADAPTER_GOOGLE_GENAI_PROJECT_DIRECTORY,
        consumerDirectory,
      );
      const adapterOpenAiTarballName = packPackageTarball(
        packageManagerEntrypoint,
        ADAPTER_OPENAI_PROJECT_DIRECTORY,
        consumerDirectory,
      );
      const cliTarballName = packPackageTarball(
        packageManagerEntrypoint,
        CLI_PROJECT_DIRECTORY,
        consumerDirectory,
      );
      const packageTarballs = {
        '@moldea.ai/adapter-anthropic': `file:./${adapterAnthropicTarballName}`,
        '@moldea.ai/adapter-google-genai': `file:./${adapterGoogleGenAiTarballName}`,
        '@moldea.ai/adapter-openai': `file:./${adapterOpenAiTarballName}`,
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

      const installedExecutablePath = path.join(
        consumerDirectory,
        'node_modules',
        '@moldea.ai',
        'cli',
        'dist',
        'moldea.js',
      );

      expect(existsSync(path.join(consumerDirectory, 'node_modules', '.bin', 'moldea'))).toBe(true);
      expect(
        runPackageManager(packageManagerEntrypoint, ['exec', 'moldea', '--version'], {
          cwd: consumerDirectory,
          encoding: 'utf8',
        }),
      ).toBe('3.1.2\n');
      const topLevelHelp = runPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', '--help'],
        {
          cwd: consumerDirectory,
          encoding: 'utf8',
        },
      );

      expect(topLevelHelp).toContain('Usage: moldea <command> [options]\n');

      const zeroArgumentHelp = spawnSync(process.execPath, [installedExecutablePath], {
        cwd: consumerDirectory,
        encoding: 'utf8',
      });

      expect(zeroArgumentHelp).toMatchObject({ status: 0, stderr: '', stdout: topLevelHelp });

      for (const command of ['compatibility', 'inspect', 'validate']) {
        const commandHelp = spawnSync(
          process.execPath,
          [installedExecutablePath, command, '--help'],
          { cwd: consumerDirectory, encoding: 'utf8' },
        );

        expect(commandHelp.status).toBe(0);
        expect(commandHelp.stderr).toBe('');
        expect(commandHelp.stdout).toContain(`Usage: moldea ${command} [options]\n`);
      }

      for (const invalidArguments of [
        ['--help', 'extra'],
        ['--version', '--no-color'],
        ['unknown'],
        ['validate', '--unknown'],
        ['validate', '--repository', '.', '--repository', '..'],
        ['validate', '--repository'],
        ['validate', '--max-entries', '0'],
        ['validate', '--max-entries', '1', '--max-entries', '2'],
        ['compatibility', '--repository', '.'],
      ]) {
        const usageFailure = spawnSync(
          process.execPath,
          [installedExecutablePath, ...invalidArguments],
          { cwd: consumerDirectory, encoding: 'utf8' },
        );

        expect(usageFailure.status).toBe(2);
        expect(usageFailure.stdout).toBe('');
        expect(usageFailure.stderr).toMatch(
          /^(?:cli:INVALID_ARGUMENT|cli:RESOURCE_LIMIT_CONFIGURATION_INVALID) /u,
        );
        expect(usageFailure.stderr.endsWith('\n')).toBe(true);
      }

      const jsonHelpFailure = spawnSync(
        process.execPath,
        [installedExecutablePath, 'validate', '--help', '--json'],
        { cwd: consumerDirectory, encoding: 'utf8' },
      );

      expect(jsonHelpFailure.status).toBe(2);
      expect(jsonHelpFailure.stderr).toBe('');
      expect(JSON.parse(jsonHelpFailure.stdout)).toMatchObject({
        command: 'validate',
        error: { code: 'INVALID_ARGUMENT' },
        result: null,
        status: 'error',
      });

      const humanCompatibility = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'compatibility'],
        consumerDirectory,
      );

      expect(humanCompatibility.status).toBe(0);
      expect(humanCompatibility.stderr).toBe('');
      expect(humanCompatibility.stdout).toContain(
        'The installed CLI compatibility state is valid.\nCLI version: 3.1.2\n',
      );
      expect(humanCompatibility.stdout).toContain(
        'custom: active=yes, bundled=2.0.0, kind=built-in, package=@moldea.ai/core, status=available\n',
      );
      expect(humanCompatibility.stdout).toContain(
        'anthropic: active=yes, bundled=2.0.1, kind=package, package=@moldea.ai/adapter-anthropic, status=available\n',
      );
      expect(humanCompatibility.stdout).toContain(
        'google-genai: active=yes, bundled=1.0.2, kind=package, package=@moldea.ai/adapter-google-genai, status=available\n',
      );
      expect(humanCompatibility.stdout).toContain(
        'openai: active=yes, bundled=2.0.3, kind=package, package=@moldea.ai/adapter-openai, status=available\n',
      );
      expect(humanCompatibility.stdout).toContain(
        'Compatible Core range: ^2.0.0\n    Repository formats: 1\n    Runtime guidance: required\n',
      );
      expect(humanCompatibility.stdout).toContain(
        'Target custom: kind=custom, language=any, support=supported, verified=2026-08-15\n',
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
            readonly matrix: {
              readonly compatibleCoreRange?: string;
              readonly implementationStatus: string;
              readonly runtimeGuidance?: { readonly expectation: string };
              readonly supportedRepositoryFormatVersions?: readonly number[];
              readonly targets?: readonly {
                readonly id: string;
                readonly patterns?: readonly { readonly id: string; readonly support: string }[];
              }[];
            };
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
            { name: '@moldea.ai/adapter-anthropic', version: '2.0.1' },
            { name: '@moldea.ai/adapter-google-genai', version: '1.0.2' },
            { name: '@moldea.ai/adapter-openai', version: '2.0.3' },
            { name: '@moldea.ai/core', version: '2.0.0' },
            { name: '@moldea.ai/repository', version: '1.0.1' },
            { name: '@moldea.ai/repository-fs', version: '1.0.2' },
          ],
        },
        status: 'valid',
      });
      expect(compatibilityEnvelope.result.adapters.find(({ id }) => id === 'custom')).toMatchObject(
        {
          active: true,
          bundledVersion: '2.0.0',
          id: 'custom',
          matrix: {
            compatibleCoreRange: '^2.0.0',
            implementationStatus: 'available',
            runtimeGuidance: { expectation: 'required' },
            supportedRepositoryFormatVersions: [1],
            targets: [
              {
                id: 'custom',
                patterns: [
                  {
                    id: 'explicit-repository-relationships',
                    support: 'full',
                  },
                ],
              },
            ],
          },
        },
      );
      expect(
        compatibilityEnvelope.result.adapters.find(({ id }) => id === 'anthropic'),
      ).toMatchObject({
        active: true,
        bundledVersion: '2.0.1',
        id: 'anthropic',
        matrix: {
          compatibleCoreRange: '^2.0.0',
          implementationStatus: 'available',
          runtimeGuidance: { expectation: 'optional' },
          supportedRepositoryFormatVersions: [1],
          targets: [{ id: 'typescript-messages-api-0-117' }],
        },
      });
      expect(
        compatibilityEnvelope.result.adapters.find(({ id }) => id === 'google-genai'),
      ).toMatchObject({
        active: true,
        bundledVersion: '1.0.2',
        id: 'google-genai',
        matrix: {
          compatibleCoreRange: '^2.0.0',
          implementationStatus: 'available',
          runtimeGuidance: { expectation: 'optional' },
          supportedRepositoryFormatVersions: [1],
          targets: [{ id: 'typescript-models-generate-content-2' }],
        },
      });
      expect(compatibilityEnvelope.result.adapters.find(({ id }) => id === 'openai')).toMatchObject(
        {
          active: true,
          bundledVersion: '2.0.3',
          id: 'openai',
          matrix: {
            compatibleCoreRange: '^2.0.0',
            implementationStatus: 'available',
            runtimeGuidance: { expectation: 'recommended' },
            supportedRepositoryFormatVersions: [1],
            targets: [{ id: 'typescript-responses-api-7' }],
          },
        },
      );

      const jsonUsageFailure = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', '--json'],
        consumerDirectory,
      );

      expect(jsonUsageFailure.status).toBe(2);
      expect(jsonUsageFailure.stderr).toBe('');
      expect(jsonUsageFailure.stdout).toBe(
        '{"cliVersion":"3.1.2","command":null,"error":{"code":"INVALID_ARGUMENT","details":{},"message":"The command invocation is invalid.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
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
        '{"cliVersion":"3.1.2","command":"inspect","error":null,"result":{"inspection":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":"/moldea/moldea.yaml","pointer":null,"range":null,"source":"core"},{"code":"MOLDEA_PROJECT_FILE_MISSING","details":{},"entity":null,"message":"The project file is missing.","path":"/moldea/project.md","pointer":null,"range":null,"source":"core"}],"evidence":[],"formatVersion":null,"project":null,"valid":false},"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
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
        '{"cliVersion":"3.1.2","command":"validate","error":null,"result":{"diagnostics":[{"code":"MOLDEA_MANIFEST_MISSING","details":{},"entity":null,"message":"The project manifest is missing.","path":"/moldea/moldea.yaml","pointer":null,"range":null,"source":"core"},{"code":"MOLDEA_PROJECT_FILE_MISSING","details":{},"entity":null,"message":"The project file is missing.","path":"/moldea/project.md","pointer":null,"range":null,"source":"core"}],"formatVersion":null,"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"invalid"}\n',
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

      const repositoryStatusBefore = execFileSync('git', ['status', '--porcelain=v2', '-z'], {
        cwd: consumerDirectory,
        encoding: 'buffer',
        env: gitEnvironment,
      });
      const repositoryExecutionMarker = path.join(testDirectory, 'repository-code-executed');

      if (process.platform !== 'win32') {
        const repositoryExecutablePath = path.join(testDirectory, 'repository-executable');

        writeFileSync(
          repositoryExecutablePath,
          `#!/usr/bin/env node
require('node:fs').writeFileSync(${JSON.stringify(repositoryExecutionMarker)}, 'executed');
process.exit(0);
`,
          'utf8',
        );
        chmodSync(repositoryExecutablePath, 0o755);
        writeFileSync(
          path.join(consumerDirectory, '.git', 'info', 'attributes'),
          'inventory-one.txt filter=moldea\n',
          'utf8',
        );
        execFileSync('git', ['config', '--local', 'core.fsmonitor', repositoryExecutablePath], {
          cwd: consumerDirectory,
          encoding: 'utf8',
          env: gitEnvironment,
        });
        execFileSync(
          'git',
          ['config', '--local', 'filter.moldea.process', repositoryExecutablePath],
          { cwd: consumerDirectory, encoding: 'utf8', env: gitEnvironment },
        );
      }

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
        '{"cliVersion":"3.1.2","command":"validate","error":null,"result":{"diagnostics":[],"formatVersion":1,"source":{"kind":"git-working-tree"}},"schemaVersion":1,"status":"valid"}\n',
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
        cliVersion: '3.1.2',
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

      const hostileEnvironmentInspection = spawnSync(
        process.execPath,
        [installedExecutablePath, 'inspect', '--json'],
        {
          cwd: consumerDirectory,
          encoding: 'utf8',
          env: {
            ...Object.fromEntries(
              Object.entries(gitEnvironment).filter(([name]) => name.toUpperCase() !== 'NO_COLOR'),
            ),
            FORCE_COLOR: '3',
            LANG: 'tr_TR.UTF-8',
            LC_ALL: 'tr_TR.UTF-8',
            TERM: 'xterm-256color',
            TZ: 'Pacific/Kiritimati',
          },
        },
      );

      expect(hostileEnvironmentInspection.status).toBe(0);
      expect(hostileEnvironmentInspection.stderr).toBe('');
      expect(hostileEnvironmentInspection.stdout).toBe(validJsonInspectionCommand.stdout);
      expect(hostileEnvironmentInspection.stdout).not.toContain('\u001b[');
      expect(
        execFileSync(
          'git',
          [
            '-c',
            'core.fsmonitor=false',
            '-c',
            'submodule.recurse=false',
            'status',
            '--porcelain=v2',
            '-z',
          ],
          {
            cwd: consumerDirectory,
            encoding: 'buffer',
            env: gitEnvironment,
          },
        ),
      ).toStrictEqual(repositoryStatusBefore);
      expect(existsSync(repositoryExecutionMarker)).toBe(false);

      const inventoryLimitCommand = spawnPackageManager(
        packageManagerEntrypoint,
        ['exec', 'moldea', 'inspect', '--json', '--max-entries', '1'],
        consumerDirectory,
        gitEnvironment,
      );

      expect(inventoryLimitCommand.status).toBe(3);
      expect(inventoryLimitCommand.stderr).toBe('');
      expect(inventoryLimitCommand.stdout).toBe(
        '{"cliVersion":"3.1.2","command":"inspect","error":{"code":"RESOURCE_LIMIT_EXCEEDED","details":{},"message":"A resource limit was exceeded.","path":null,"retryable":false,"source":"cli"},"result":null,"schemaVersion":1,"status":"error"}\n',
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
        '{"cliVersion":"3.1.2","command":"validate","error":{"code":"GIT_NOT_FOUND","details":{},"message":"The Git executable is unavailable.","path":null,"retryable":false,"source":"git"},"result":null,"schemaVersion":1,"status":"error"}\n',
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
        const fakeGitVersionDirectory = path.join(testDirectory, 'fake-git-version');
        const fakeGitVersionPath = path.join(fakeGitVersionDirectory, 'git');
        const realGitPath = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();

        mkdirSync(fakeGitVersionDirectory);
        writeFileSync(
          fakeGitVersionPath,
          `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

if (process.argv.includes('--version')) {
  process.stdout.write(process.env.MOLDEA_TEST_GIT_VERSION_OUTPUT);
  process.exit(0);
}

const result = spawnSync(${JSON.stringify(realGitPath)}, process.argv.slice(2), {
  env: process.env,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
`,
          'utf8',
        );
        chmodSync(fakeGitVersionPath, 0o755);

        for (const [versionOutput, errorCode] of [
          ['git version invalid\n', 'GIT_VERSION_INVALID'],
          ['git version 2.29.9\n', 'GIT_VERSION_UNSUPPORTED'],
        ] as const) {
          const versionFailure = spawnSync(
            process.execPath,
            [installedExecutablePath, 'validate', '--json'],
            {
              cwd: consumerDirectory,
              encoding: 'utf8',
              env: {
                ...gitEnvironment,
                MOLDEA_TEST_GIT_VERSION_OUTPUT: versionOutput,
                PATH: `${fakeGitVersionDirectory}${path.delimiter}${gitEnvironment['PATH'] ?? ''}`,
              },
            },
          );

          expect(versionFailure.status).toBe(3);
          expect(versionFailure.stderr).toBe('');
          expect(JSON.parse(versionFailure.stdout)).toMatchObject({
            command: 'validate',
            error: { code: errorCode, details: {}, path: null, source: 'git' },
            result: null,
            status: 'error',
          });
          expect(versionFailure.stdout).not.toContain(consumerDirectory);
        }

        const fakeGitDirectory = path.join(testDirectory, 'fake-git');
        const fakeGitPath = path.join(fakeGitDirectory, 'git');

        mkdirSync(fakeGitDirectory);
        writeFileSync(
          fakeGitPath,
          `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
process.on('SIGTERM', () => {
  writeFileSync(process.env.MOLDEA_TEST_GIT_STOPPED, 'stopped');
  process.exit(0);
});
writeFileSync(process.env.MOLDEA_TEST_GIT_STARTED, 'started');
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
  }, 60_000);
});
