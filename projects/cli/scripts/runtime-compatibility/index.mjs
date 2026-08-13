import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Selects one unambiguous package tarball from the prepared artifact directory. */
const selectPackageTarball = (tarballNames, pattern, packageName) => {
  const matchingNames = tarballNames.filter((tarballName) => pattern.test(tarballName));

  if (matchingNames.length !== 1 || matchingNames[0] === undefined) {
    throw new Error(`Expected exactly one ${packageName} tarball.`);
  }

  return matchingNames[0];
};

/** Executes the installed CLI while retaining its handled process result. */
const executeCli = (executablePath, arguments_, cwd, environment) =>
  spawnSync(process.execPath, [executablePath, ...arguments_], {
    cwd,
    encoding: 'utf8',
    env: environment,
  });

/** Requires one invariant from the packed-runtime consumer check. */
const assertRuntimeInvariant = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

/** Reads and parses one installed package manifest. */
const readInstalledManifest = async (consumerDirectory, packageName) => {
  const manifestPath = path.join(
    consumerDirectory,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );

  return JSON.parse(await readFile(manifestPath, 'utf8'));
};

/** Runs one Git fixture command without inherited configuration or hooks. */
const executeFixtureGit = (consumerDirectory, hooksDirectory, environment, arguments_) => {
  execFileSync(
    'git',
    [
      '-c',
      `core.hooksPath=${hooksDirectory}`,
      '-c',
      'init.defaultBranch=main',
      '-c',
      'user.name=Moldea Runtime Test',
      '-c',
      'user.email=moldea-runtime@example.invalid',
      ...arguments_,
    ],
    { cwd: consumerDirectory, env: environment, stdio: 'ignore' },
  );
};

/** Installs and exercises the packed CLI composition under the active Node.js runtime. */
const runRuntimeCompatibilityCheck = async (artifactDirectory) => {
  const tarballNames = await readdir(artifactDirectory);
  const packageTarballNames = {
    '@moldea.ai/cli': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-cli-.+\.tgz$/u,
      '@moldea.ai/cli',
    ),
    '@moldea.ai/core': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-core-.+\.tgz$/u,
      '@moldea.ai/core',
    ),
    '@moldea.ai/repository': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-repository-(?!fs-).+\.tgz$/u,
      '@moldea.ai/repository',
    ),
    '@moldea.ai/repository-fs': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-repository-fs-.+\.tgz$/u,
      '@moldea.ai/repository-fs',
    ),
  };
  const consumerDirectory = await mkdtemp(path.join(tmpdir(), 'moldea-cli-runtime-consumer-'));
  const homeDirectory = path.join(consumerDirectory, '.home');
  const configDirectory = path.join(consumerDirectory, '.config');
  const hooksDirectory = path.join(consumerDirectory, '.hooks');
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  try {
    await Promise.all(
      [homeDirectory, configDirectory, hooksDirectory].map((directory) =>
        mkdir(directory, { recursive: true }),
      ),
    );
    await writeFile(
      path.join(consumerDirectory, 'package.json'),
      `${JSON.stringify({ name: 'moldea-cli-runtime-consumer', private: true, type: 'module' })}\n`,
      'utf8',
    );

    execFileSync(
      npmExecutable,
      [
        'install',
        '--ignore-scripts',
        '--engine-strict',
        '--package-lock=false',
        '--audit=false',
        '--fund=false',
        ...Object.values(packageTarballNames).map((tarballName) =>
          path.join(artifactDirectory, tarballName),
        ),
      ],
      { cwd: consumerDirectory, stdio: 'inherit' },
    );

    const manifests = Object.fromEntries(
      await Promise.all(
        Object.keys(packageTarballNames).map(async (packageName) => [
          packageName,
          await readInstalledManifest(consumerDirectory, packageName),
        ]),
      ),
    );
    const cliManifest = manifests['@moldea.ai/cli'];
    const executablePath = path.join(
      consumerDirectory,
      'node_modules',
      '@moldea.ai',
      'cli',
      'dist',
      'moldea.js',
    );
    const environment = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'NO_COLOR'),
      ),
      FORCE_COLOR: '3',
      HOME: homeDirectory,
      LANG: 'tr_TR.UTF-8',
      LC_ALL: 'tr_TR.UTF-8',
      TERM: 'xterm-256color',
      TZ: 'Pacific/Kiritimati',
      XDG_CONFIG_HOME: configDirectory,
    };

    assertRuntimeInvariant(cliManifest?.name === '@moldea.ai/cli', 'The CLI identity is invalid.');
    assertRuntimeInvariant(cliManifest?.version === '0.0.1', 'The CLI version is invalid.');
    assertRuntimeInvariant(
      cliManifest?.engines?.node === '^22.11.0 || ^24.11.0',
      'The CLI runtime range is invalid.',
    );
    for (const packageName of [
      '@moldea.ai/core',
      '@moldea.ai/repository',
      '@moldea.ai/repository-fs',
    ]) {
      assertRuntimeInvariant(
        manifests[packageName]?.name === packageName,
        `The installed ${packageName} identity is invalid.`,
      );
      assertRuntimeInvariant(
        manifests[packageName]?.version === cliManifest.dependencies?.[packageName],
        `The installed ${packageName} version is inconsistent.`,
      );
    }

    const versionResult = executeCli(executablePath, ['--version'], consumerDirectory, environment);

    assertRuntimeInvariant(versionResult.status === 0, 'The installed CLI version command failed.');
    assertRuntimeInvariant(versionResult.stderr === '', 'The version command wrote stderr.');
    assertRuntimeInvariant(versionResult.stdout === '0.0.1\n', 'The version output is invalid.');

    const compatibilityResult = executeCli(
      executablePath,
      ['compatibility', '--json'],
      consumerDirectory,
      environment,
    );
    const compatibilityEnvelope = JSON.parse(compatibilityResult.stdout);

    assertRuntimeInvariant(
      compatibilityResult.status === 0,
      'The installed CLI compatibility command failed.',
    );
    assertRuntimeInvariant(
      compatibilityResult.stderr === '',
      'The compatibility command wrote stderr.',
    );
    assertRuntimeInvariant(
      compatibilityEnvelope.status === 'valid' &&
        compatibilityEnvelope.result?.supportedNodeRange === '^22.11.0 || ^24.11.0',
      'The compatibility result is invalid.',
    );

    executeFixtureGit(consumerDirectory, hooksDirectory, environment, ['init']);
    await mkdir(path.join(consumerDirectory, 'moldea'));
    await writeFile(path.join(consumerDirectory, 'moldea', 'moldea.yaml'), 'version: 1\n', 'utf8');
    await writeFile(path.join(consumerDirectory, 'moldea', 'project.md'), '# Project\n', 'utf8');
    executeFixtureGit(consumerDirectory, hooksDirectory, environment, [
      'add',
      '--',
      'moldea/moldea.yaml',
      'moldea/project.md',
    ]);
    const statusBefore = execFileSync('git', ['status', '--porcelain=v2', '-z'], {
      cwd: consumerDirectory,
      encoding: 'buffer',
      env: environment,
    });
    const validateResult = executeCli(
      executablePath,
      ['validate', '--json'],
      consumerDirectory,
      environment,
    );
    const inspectResult = executeCli(
      executablePath,
      ['inspect', '--json'],
      consumerDirectory,
      environment,
    );
    const statusAfter = execFileSync('git', ['status', '--porcelain=v2', '-z'], {
      cwd: consumerDirectory,
      encoding: 'buffer',
      env: environment,
    });
    const validateEnvelope = JSON.parse(validateResult.stdout);
    const inspectEnvelope = JSON.parse(inspectResult.stdout);

    assertRuntimeInvariant(validateResult.status === 0, 'The installed CLI validation failed.');
    assertRuntimeInvariant(validateResult.stderr === '', 'The validation command wrote stderr.');
    assertRuntimeInvariant(
      validateEnvelope.status === 'valid',
      'The validation result is invalid.',
    );
    assertRuntimeInvariant(
      !validateResult.stdout.includes('# Project'),
      'Validation exposed canonical repository content.',
    );
    assertRuntimeInvariant(inspectResult.status === 0, 'The installed CLI inspection failed.');
    assertRuntimeInvariant(inspectResult.stderr === '', 'The inspection command wrote stderr.');
    assertRuntimeInvariant(
      inspectEnvelope.result?.inspection?.project?.project?.content === '# Project\n',
      'Inspection omitted the complete Core result.',
    );
    assertRuntimeInvariant(
      !`${compatibilityResult.stdout}${validateResult.stdout}${inspectResult.stdout}`.includes(
        '\u001b[',
      ),
      'JSON output contains ANSI control sequences.',
    );
    assertRuntimeInvariant(statusBefore.equals(statusAfter), 'The CLI changed repository state.');
  } finally {
    await rm(consumerDirectory, { force: true, recursive: true });
  }
};

const artifactDirectory = process.argv[2];

if (artifactDirectory === undefined || process.argv.length !== 3) {
  throw new Error('Provide exactly one prepared package-artifact directory.');
}

await runRuntimeCompatibilityCheck(path.resolve(artifactDirectory));
