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

/** Installs and exercises the packed Cloudflare Agents adapter under the active Node.js runtime. */
const runRuntimeCompatibilityCheck = async (artifactDirectory) => {
  const tarballNames = await readdir(artifactDirectory);
  const packageTarballNames = [
    selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-cloudflare-agents-.+\.tgz$/u,
      '@moldea.ai/adapter-cloudflare-agents',
    ),
    selectPackageTarball(tarballNames, /^moldea\.ai-core-.+\.tgz$/u, '@moldea.ai/core'),
    selectPackageTarball(
      tarballNames,
      /^moldea\.ai-repository-(?!fs-).+\.tgz$/u,
      '@moldea.ai/repository',
    ),
  ];
  const consumerDirectory = await mkdtemp(
    path.join(tmpdir(), 'moldea-adapter-cloudflare-agents-runtime-consumer-'),
  );
  const consumerPath = path.join(consumerDirectory, 'consumer.mjs');
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  try {
    await writeFile(
      path.join(consumerDirectory, 'package.json'),
      `${JSON.stringify({ name: 'adapter-cloudflare-agents-runtime-consumer', private: true, type: 'module' })}\n`,
      'utf8',
    );
    await copyFile(consumerFixturePath, consumerPath);
    execFileSync(
      npmExecutable,
      [
        'install',
        '--ignore-scripts',
        '--engine-strict',
        '--package-lock=false',
        '--audit=false',
        '--fund=false',
        ...packageTarballNames.map((name) => path.join(artifactDirectory, name)),
      ],
      { cwd: consumerDirectory, stdio: 'inherit' },
    );
    execFileSync(process.execPath, [consumerPath], {
      cwd: consumerDirectory,
      env: {
        ...process.env,
        LANG: 'tr_TR.UTF-8',
        LC_ALL: 'tr_TR.UTF-8',
        TZ: 'Pacific/Kiritimati',
      },
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
