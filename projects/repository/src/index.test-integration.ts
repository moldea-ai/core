// @vitest-environment node
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  REPOSITORY_ROOT,
  RepositoryPathException,
  RepositorySourceException,
  isRepositoryPath,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryEntryType,
  type IRepositoryListOptions,
  type IRepositoryOperation,
  type IRepositoryOperationOptions,
  type IRepositoryPath,
  type IRepositoryPathExceptionOptions,
  type IRepositoryReader,
  type IRepositorySourceErrorCode,
  type IRepositorySourceExceptionOptions,
} from './index.js';
import { createMemoryRepositoryReader, type IMemoryRepositoryEntry } from './memory.js';

const projectDirectory = path.resolve(import.meta.dirname, '..');
const distributionDirectory = path.join(projectDirectory, 'dist');
const publicApiFixtureDirectory = path.join(projectDirectory, 'src', 'index.test-fixtures');
const typescriptEntrypoint = path.join(
  projectDirectory,
  'node_modules',
  'typescript',
  'bin',
  'tsc',
);

interface IPackDryRunResult {
  readonly files: readonly { readonly path: string }[];
  readonly name: string;
  readonly version: string;
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

const readDistributionFiles = (extension: string): readonly string[] => {
  return readdirSync(distributionDirectory, { recursive: true })
    .filter(
      (fileName): fileName is string =>
        typeof fileName === 'string' && fileName.endsWith(extension),
    )
    .map((fileName) => readFileSync(path.join(distributionDirectory, fileName), 'utf8'));
};

describe('published package artifacts', () => {
  test('exposes the documented public type surface', () => {
    const repositoryPath: IRepositoryPath = parseRepositoryPath('/file.txt');
    const root: IRepositoryPath = REPOSITORY_ROOT;
    const entryType: IRepositoryEntryType = 'file';
    const entry: IRepositoryEntry = { path: repositoryPath, type: entryType };
    const operationOptions: IRepositoryOperationOptions = {
      signal: new AbortController().signal,
    };
    const listOptions: IRepositoryListOptions = { prefix: root, ...operationOptions };
    const operation: IRepositoryOperation = 'read-file';
    const sourceCode: IRepositorySourceErrorCode = 'ENTRY_NOT_FOUND';
    const pathExceptionOptions: IRepositoryPathExceptionOptions = { cause: new Error('cause') };
    const sourceExceptionOptions: IRepositorySourceExceptionOptions = {
      code: sourceCode,
      operation,
      path: repositoryPath,
      retryable: false,
    };
    const memoryEntries: readonly IMemoryRepositoryEntry[] = [
      { content: new Uint8Array([1]), path: repositoryPath, type: 'file' },
    ];
    const reader: IRepositoryReader = createMemoryRepositoryReader(memoryEntries);
    const pathException = new RepositoryPathException(pathExceptionOptions);
    const sourceException = new RepositorySourceException(sourceExceptionOptions);

    expect(isRepositoryPath(repositoryPath)).toBe(true);
    expect(entry).toStrictEqual({ path: repositoryPath, type: 'file' });
    expect(listOptions.prefix).toBe(REPOSITORY_ROOT);
    expect(reader).toHaveProperty('getEntry', expect.any(Function));
    expect(pathException).toBeInstanceOf(RepositoryPathException);
    expect(sourceException).toBeInstanceOf(RepositorySourceException);

    // @ts-expect-error A plain string has not passed runtime repository-path validation.
    const forgedPath: IRepositoryPath = '/unvalidated.txt';
    void forgedPath;
  });

  test('packs only the intended public-package files and one runtime dependency', () => {
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
    ) as { readonly dependencies?: Readonly<Record<string, string>> };
    const packedPaths = packResult.files.map((file) => file.path);

    expect(packResult).toMatchObject({ name: '@moldea.ai/repository', version: '0.0.1' });
    expect(packedPaths).toContain('dist/index.js');
    expect(packedPaths).toContain('dist/index.d.ts');
    expect(packedPaths).toContain('dist/memory.js');
    expect(packedPaths).toContain('dist/memory.d.ts');
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
    expect(manifest.dependencies).toStrictEqual({ 'error-message-utils': '1.2.11' });
  });

  test('loads only the documented named runtime exports through package self-resolution', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          "const root = await import('@moldea.ai/repository');",
          "const memory = await import('@moldea.ai/repository/memory');",
          'console.log(JSON.stringify({ root: Object.keys(root).sort(), memory: Object.keys(memory).sort() }));',
        ].join(''),
      ],
      { cwd: projectDirectory, encoding: 'utf8' },
    );

    expect(JSON.parse(output)).toStrictEqual({
      memory: ['createMemoryRepositoryReader'],
      root: [
        'REPOSITORY_ROOT',
        'RepositoryPathException',
        'RepositorySourceException',
        'isRepositoryPath',
        'parseRepositoryPath',
      ],
    });
  });

  test('emits declarations for both public entry points without leaking internal workspace imports', () => {
    const indexDeclaration = readFileSync(path.join(distributionDirectory, 'index.d.ts'), 'utf8');
    const memoryDeclaration = readFileSync(path.join(distributionDirectory, 'memory.d.ts'), 'utf8');
    const allDeclarations = readDistributionFiles('.d.ts').join('\n');

    expect(indexDeclaration).toContain('IRepositoryReader');
    expect(indexDeclaration).toContain('parseRepositoryPath');
    expect(memoryDeclaration).toContain('IMemoryRepositoryEntry');
    expect(memoryDeclaration).toContain('createMemoryRepositoryReader');
    expect(allDeclarations).not.toMatch(/from ['"]@moldea\.ai\//u);
    expect(allDeclarations).not.toContain('packages/');
  });

  test('typechecks a consumer through both built package entry points', () => {
    execFileSync(
      process.execPath,
      [typescriptEntrypoint, '--project', path.join(publicApiFixtureDirectory, 'tsconfig.json')],
      {
        cwd: projectDirectory,
        encoding: 'utf8',
      },
    );
  });

  test('keeps the runtime artifact environment-neutral', () => {
    const javascript = readDistributionFiles('.js').join('\n');

    expect(javascript).not.toMatch(/from ['"]node:/u);
    expect(javascript).not.toMatch(/require\(['"](?:node:)?/u);
    expect(javascript).not.toContain('process.');
  });
});
