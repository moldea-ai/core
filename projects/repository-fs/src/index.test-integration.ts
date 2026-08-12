// @vitest-environment node
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';

const projectDirectory = path.resolve(import.meta.dirname, '..');
const repositoryProjectDirectory = path.resolve(projectDirectory, '..', 'repository');
const distributionDirectory = path.join(projectDirectory, 'dist');
const publicApiFixtureDirectory = path.join(projectDirectory, 'src', 'index.test-fixtures');
const typescriptEntrypoint = path.join(
  projectDirectory,
  'node_modules',
  'typescript',
  'bin',
  'tsc',
);

// package-manager metadata needed to verify the generated public tarball
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

/**
 * Reads every generated distribution file with one extension.
 * @param extension The exact emitted filename suffix to include.
 * @returns The matching file contents in directory enumeration order.
 */
const readDistributionFiles = (extension: string): readonly string[] => {
  return readdirSync(distributionDirectory, { recursive: true })
    .filter(
      (fileName): fileName is string =>
        typeof fileName === 'string' && fileName.endsWith(extension),
    )
    .map((fileName) => readFileSync(path.join(distributionDirectory, fileName), 'utf8'));
};

/**
 * Packs one project and returns the single newly created tarball name.
 * @param packageDirectory The package project to pack.
 * @param packDirectory The isolated destination for generated tarballs.
 * @returns The generated tarball basename.
 * @throws
 * - If the package-manager entrypoint is unavailable or packing is not deterministic
 */
const packPackageTarball = (packageDirectory: string, packDirectory: string): string => {
  const packageManagerEntrypoint = process.env['npm_execpath'];

  if (packageManagerEntrypoint === undefined) {
    throw new Error('The package-manager entrypoint is unavailable.');
  }

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

/**
 * Reads one regular entry from the uncompressed USTAR-compatible package archive.
 * @param tarball The complete gzip-compressed package tarball.
 * @param entryPath The exact archive path to locate.
 * @returns The entry content as a view over the decompressed archive.
 * @throws
 * - If the requested archive entry is absent
 */
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

describe('published Repository FS package artifacts', () => {
  test('packs only intended files with the documented metadata and dependency', () => {
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
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly engines?: Readonly<Record<string, string>>;
    };
    const packedPaths = packResult.files.map((file) => file.path);

    expect(packResult).toMatchObject({ name: '@moldea.ai/repository-fs', version: '0.0.1' });
    expect(packedPaths).toContain('dist/index.js');
    expect(packedPaths).toContain('dist/index.d.ts');
    expect(packedPaths).toContain('dist/contracts/index.d.ts');
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
    expect(manifest.dependencies).toStrictEqual({
      '@moldea.ai/repository': 'workspace:^0.0.1',
    });
    expect(manifest.engines).toStrictEqual({ node: '^22.11.0 || ^24.11.0' });
  });

  test('loads only the documented named runtime exports', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          "const repositoryFilesystem = await import('@moldea.ai/repository-fs');",
          'console.log(JSON.stringify({ exports: Object.keys(repositoryFilesystem).sort(), frozen: Object.isFrozen(repositoryFilesystem.DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS), limits: repositoryFilesystem.DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS }));',
        ].join(''),
      ],
      { cwd: projectDirectory, encoding: 'utf8' },
    );

    expect(JSON.parse(output)).toStrictEqual({
      exports: [
        'DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS',
        'createFilesystemRepositoryReader',
      ],
      frozen: true,
      limits: {
        maxCachedBytes: 134_217_728,
        maxEntries: 100_000,
        maxFileBytes: 8_388_608,
      },
    });
  });

  test('rewrites the Repository workspace dependency in the real tarball manifest', () => {
    const packageManagerEntrypoint = process.env['npm_execpath'];

    if (packageManagerEntrypoint === undefined) {
      throw new Error('The package-manager entrypoint is unavailable.');
    }

    const packDirectory = mkdtempSync(path.join(tmpdir(), 'moldea-repository-fs-pack-'));

    try {
      const tarballName = packPackageTarball(projectDirectory, packDirectory);
      const manifest = JSON.parse(
        readTarEntry(
          readFileSync(path.join(packDirectory, tarballName)),
          'package/package.json',
        ).toString('utf8'),
      ) as { readonly dependencies?: Readonly<Record<string, string>> };

      expect(manifest.dependencies).toStrictEqual({
        '@moldea.ai/repository': '^0.0.1',
      });
    } finally {
      rmSync(packDirectory, { force: true, recursive: true });
    }
  });

  test('emits the public declarations without exposing private root preparation', () => {
    const indexDeclaration = readFileSync(path.join(distributionDirectory, 'index.d.ts'), 'utf8');
    const contractsDeclaration = readFileSync(
      path.join(distributionDirectory, 'contracts', 'index.d.ts'),
      'utf8',
    );
    const allDeclarations = readDistributionFiles('.d.ts').join('\n');

    expect(indexDeclaration).toContain('IFilesystemRepositoryReaderOptions');
    expect(indexDeclaration).toContain('DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS');
    expect(indexDeclaration).toContain('createFilesystemRepositoryReader');
    expect(indexDeclaration).not.toContain('prepareFilesystemRepositoryRoot');
    expect(indexDeclaration).not.toContain('createFilesystemDirectoryInventory');
    expect(indexDeclaration).not.toContain('createFilesystemDirectoryEntryCandidates');
    expect(indexDeclaration).not.toContain('registerFilesystemDirectoryIdentity');
    expect(indexDeclaration).not.toContain('createVerifiedFilesystemInventory');
    expect(indexDeclaration).not.toContain('getFilesystemRepositoryEntry');
    expect(indexDeclaration).not.toContain('listFilesystemRepositoryEntries');
    expect(indexDeclaration).not.toContain('captureFilesystemRepositoryFile');
    expect(indexDeclaration).not.toContain('coordinateFilesystemRepositoryFileCapture');
    expect(indexDeclaration).not.toContain('reserveFilesystemFileCaptureCapacity');
    expect(indexDeclaration).not.toContain('releaseFilesystemFileCaptureCapacity');
    expect(indexDeclaration).not.toContain('commitReservedFilesystemFileCapture');
    expect(indexDeclaration).not.toContain('createFilesystemRepositoryReaderState');
    expect(indexDeclaration).not.toContain('readFilesystemRepositoryFile');
    expect(indexDeclaration).not.toContain('IFilesystemRepositoryReaderState');
    expect(indexDeclaration).not.toContain('IFilesystemRepositoryFileCaptureReservation');
    expect(indexDeclaration).not.toContain('IFilesystemRepositoryPendingFileCapture');
    expect(indexDeclaration).not.toContain('invalidateFilesystemRepositoryReader');
    expect(indexDeclaration).not.toContain('markFilesystemRepositoryReaderInvalidated');
    expect(indexDeclaration).not.toContain('throwIfFilesystemRepositoryReaderInvalidated');
    expect(indexDeclaration).not.toContain('verifyFilesystemDirectoryInventory');
    expect(indexDeclaration).not.toContain('verifyFilesystemExactPathInventory');
    expect(indexDeclaration).not.toContain('createFilesystemRegularFileFingerprint');
    expect(indexDeclaration).not.toContain('IFilesystemRegularFileFingerprint');
    expect(indexDeclaration).not.toContain('IFilesystemInventory');
    expect(indexDeclaration).not.toContain('createFilesystemExactPathInventory');
    expect(indexDeclaration).not.toContain('createFilesystemExactPathSelectionPlan');
    expect(indexDeclaration).not.toContain('decodeFilesystemName');
    expect(indexDeclaration).not.toContain('classifyFilesystemEntry');
    expect(indexDeclaration).not.toContain('getMissingFilesystemExactPathDirectoryEntries');
    expect(indexDeclaration).not.toContain('matchFilesystemExactPathDirectoryNames');
    expect(indexDeclaration).not.toContain('throwObservedFilesystemRepositoryCreationError');
    expect(contractsDeclaration).toContain("from '@moldea.ai/repository'");
    expect(allDeclarations).not.toMatch(/from ['"]@moldea\.ai\/(?!repository(?:['"/]))/u);
    expect(allDeclarations).not.toContain('packages/');
  });

  test('typechecks the complete public reader surface through package resolution', () => {
    execFileSync(
      process.execPath,
      [typescriptEntrypoint, '--project', path.join(publicApiFixtureDirectory, 'tsconfig.json')],
      {
        cwd: projectDirectory,
        encoding: 'utf8',
      },
    );
  });

  test('installs real Repository FS and Repository tarballs and typechecks a consumer', () => {
    const packageManagerEntrypoint = process.env['npm_execpath'];

    if (packageManagerEntrypoint === undefined) {
      throw new Error('The package-manager entrypoint is unavailable.');
    }

    const consumerDirectory = mkdtempSync(path.join(tmpdir(), 'moldea-repository-fs-consumer-'));

    try {
      const repositoryTarballName = packPackageTarball(
        repositoryProjectDirectory,
        consumerDirectory,
      );
      const repositoryFilesystemTarballName = packPackageTarball(
        projectDirectory,
        consumerDirectory,
      );

      writeFileSync(
        path.join(consumerDirectory, 'package.json'),
        `${JSON.stringify(
          {
            dependencies: {
              '@moldea.ai/repository': `file:./${repositoryTarballName}`,
              '@moldea.ai/repository-fs': `file:./${repositoryFilesystemTarballName}`,
            },
            devDependencies: {
              '@types/node': '22.20.1',
            },
            name: 'moldea-repository-fs-tarball-consumer',
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
        `packages:\n  - .\noverrides:\n  '@moldea.ai/repository': file:./${repositoryTarballName}\n`,
        'utf8',
      );
      copyFileSync(
        path.join(publicApiFixtureDirectory, 'public-api.test-fixture.mts'),
        path.join(consumerDirectory, 'public-api.test-fixture.mts'),
      );
      writeFileSync(
        path.join(consumerDirectory, 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: { skipLibCheck: false },
            extends: path.resolve(
              projectDirectory,
              '..',
              '..',
              'configs',
              'typescript',
              'node.json',
            ),
            files: ['public-api.test-fixture.mts'],
          },
          null,
          2,
        )}\n`,
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
      execFileSync(process.execPath, [typescriptEntrypoint, '--project', 'tsconfig.json'], {
        cwd: consumerDirectory,
        encoding: 'utf8',
      });
      const runtimeOutput = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          [
            "import { DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS as limits, createFilesystemRepositoryReader } from '@moldea.ai/repository-fs';",
            'console.log(JSON.stringify({ factory: typeof createFilesystemRepositoryReader, frozen: Object.isFrozen(limits), limits }));',
          ].join(''),
        ],
        { cwd: consumerDirectory, encoding: 'utf8' },
      );

      expect(JSON.parse(runtimeOutput)).toStrictEqual({
        factory: 'function',
        frozen: true,
        limits: {
          maxCachedBytes: 134_217_728,
          maxEntries: 100_000,
          maxFileBytes: 8_388_608,
        },
      });
    } finally {
      rmSync(consumerDirectory, { force: true, recursive: true });
    }
  }, 20_000);
});
