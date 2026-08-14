import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const consumerFixturePath = path.join(scriptDirectory, 'consumer.mjs');

/** Selects one unambiguous package tarball from the prepared artifact directory. */
const selectPackageTarball = (tarballNames, pattern, packageName) => {
  const matchingNames = tarballNames.filter((tarballName) => pattern.test(tarballName));

  if (matchingNames.length !== 1 || matchingNames[0] === undefined) {
    throw new Error(`Expected exactly one ${packageName} tarball.`);
  }

  return matchingNames[0];
};

/** Installs and exercises the packed public packages under the active Node.js runtime. */
const runRuntimeCompatibilityCheck = async (artifactDirectory) => {
  const tarballNames = await readdir(artifactDirectory);
  const repositoryTarballName = selectPackageTarball(
    tarballNames,
    /^moldea\.ai-repository-(?!fs-).+\.tgz$/u,
    '@moldea.ai/repository',
  );
  const repositoryFilesystemTarballName = selectPackageTarball(
    tarballNames,
    /^moldea\.ai-repository-fs-.+\.tgz$/u,
    '@moldea.ai/repository-fs',
  );
  const consumerDirectory = await mkdtemp(
    path.join(tmpdir(), 'moldea-repository-fs-runtime-consumer-'),
  );
  const consumerPath = path.join(consumerDirectory, 'consumer.mjs');
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  try {
    await writeFile(
      path.join(consumerDirectory, 'package.json'),
      `${JSON.stringify({ name: 'repository-fs-runtime-consumer', private: true, type: 'module' })}\n`,
      'utf8',
    );
    await copyFile(consumerFixturePath, consumerPath);

    execFileSync(
      npmExecutable,
      [
        'install',
        '--ignore-scripts',
        '--package-lock=false',
        '--audit=false',
        '--fund=false',
        path.join(artifactDirectory, repositoryTarballName),
        path.join(artifactDirectory, repositoryFilesystemTarballName),
      ],
      { cwd: consumerDirectory, stdio: 'inherit' },
    );
    execFileSync(process.execPath, [consumerPath], {
      cwd: consumerDirectory,
      stdio: 'inherit',
    });
  } finally {
    await rm(consumerDirectory, { force: true, recursive: true });
  }
};

const artifactDirectory = process.argv[2];

if (artifactDirectory === undefined || process.argv.length !== 3) {
  throw new Error('Provide exactly one prepared package-artifact directory.');
}

await runRuntimeCompatibilityCheck(path.resolve(artifactDirectory));
