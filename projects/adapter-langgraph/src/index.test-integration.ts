// @vitest-environment node
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import * as publicApi from './index.js';

const projectDirectory = path.resolve(import.meta.dirname, '..');
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

describe('@moldea.ai/adapter-langgraph public API', () => {
  test('exposes only the intended runtime symbol', () => {
    expect(Object.keys(publicApi)).toStrictEqual(['langGraphAdapter']);
  });

  test('emits consumable public artifacts without private imports or test files', () => {
    const declaration = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
    const runtime = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');

    expect(declaration).toContain('langGraphAdapter');
    expect(declaration).not.toContain('LANGGRAPH_ADAPTER_DIAGNOSTICS');
    expect(declaration).not.toContain('ILangGraphAdapterDiagnosticCode');
    expect(declaration).not.toContain('@moldea.ai/adapter-static-analysis');
    expect(declaration).not.toContain('.test-');
    expect(runtime).not.toContain('@moldea.ai/adapter-static-analysis');
    execFileSync(
      process.execPath,
      [typescriptEntrypoint, '--project', path.join(publicApiFixtureDirectory, 'tsconfig.json')],
      { cwd: projectDirectory, stdio: 'pipe' },
    );
  });

  test('packs only intended files and exact runtime dependency composition', () => {
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
    const packedCodePaths = packedPaths.filter(
      (filePath) => filePath.startsWith('dist/') && /\.(?:d\.ts|js)$/u.test(filePath),
    );

    expect(packResult).toMatchObject({
      name: '@moldea.ai/adapter-langgraph',
      version: '1.0.2',
    });
    expect(packedPaths).toEqual(
      expect.arrayContaining([
        'LICENSE',
        'README.md',
        'cover.png',
        'dist/index.d.ts',
        'dist/index.js',
        'package.json',
      ]),
    );
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
    expect(packedPaths.every((filePath) => !filePath.endsWith('.js.map'))).toBe(true);
    expect(
      packedCodePaths.every(
        (filePath) =>
          !readFileSync(path.join(projectDirectory, filePath), 'utf8').includes(
            '@moldea.ai/adapter-static-analysis',
          ),
      ),
    ).toBe(true);
    expect(manifest.dependencies).toStrictEqual({
      '@moldea.ai/core': 'workspace:^2.0.0',
      '@moldea.ai/repository': 'workspace:^1.0.0',
      semver: '7.8.5',
      typescript: '6.0.3',
    });
  });
});
