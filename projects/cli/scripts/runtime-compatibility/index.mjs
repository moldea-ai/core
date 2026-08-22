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
    '@moldea.ai/adapter-anthropic': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-anthropic-.+\.tgz$/u,
      '@moldea.ai/adapter-anthropic',
    ),
    '@moldea.ai/adapter-claude-agent-sdk': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-claude-agent-sdk-.+\.tgz$/u,
      '@moldea.ai/adapter-claude-agent-sdk',
    ),
    '@moldea.ai/adapter-google-genai': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-google-genai-.+\.tgz$/u,
      '@moldea.ai/adapter-google-genai',
    ),
    '@moldea.ai/adapter-langchain': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-langchain-.+\.tgz$/u,
      '@moldea.ai/adapter-langchain',
    ),
    '@moldea.ai/adapter-langgraph': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-langgraph-.+\.tgz$/u,
      '@moldea.ai/adapter-langgraph',
    ),
    '@moldea.ai/adapter-openai': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-openai-(?!agents-sdk-).+\.tgz$/u,
      '@moldea.ai/adapter-openai',
    ),
    '@moldea.ai/adapter-openai-agents-sdk': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-openai-agents-sdk-.+\.tgz$/u,
      '@moldea.ai/adapter-openai-agents-sdk',
    ),
    '@moldea.ai/adapter-cloudflare-agents': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-cloudflare-agents-.+\.tgz$/u,
      '@moldea.ai/adapter-cloudflare-agents',
    ),
    '@moldea.ai/adapter-eve': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-eve-.+\.tgz$/u,
      '@moldea.ai/adapter-eve',
    ),
    '@moldea.ai/adapter-vercel-ai-sdk': selectPackageTarball(
      tarballNames,
      /^moldea\.ai-adapter-vercel-ai-sdk-.+\.tgz$/u,
      '@moldea.ai/adapter-vercel-ai-sdk',
    ),
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
    assertRuntimeInvariant(cliManifest?.version === '4.0.0', 'The CLI version is invalid.');
    assertRuntimeInvariant(
      cliManifest?.engines?.node === '^22.11.0 || ^24.11.0',
      'The CLI runtime range is invalid.',
    );
    for (const packageName of [
      '@moldea.ai/adapter-anthropic',
      '@moldea.ai/adapter-claude-agent-sdk',
      '@moldea.ai/adapter-google-genai',
      '@moldea.ai/adapter-langchain',
      '@moldea.ai/adapter-langgraph',
      '@moldea.ai/adapter-openai',
      '@moldea.ai/adapter-openai-agents-sdk',
      '@moldea.ai/adapter-cloudflare-agents',
      '@moldea.ai/adapter-eve',
      '@moldea.ai/adapter-vercel-ai-sdk',
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
    assertRuntimeInvariant(versionResult.stdout === '4.0.0\n', 'The version output is invalid.');

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
        compatibilityEnvelope.result?.supportedNodeRange === '^22.11.0 || ^24.11.0' &&
        typeof compatibilityEnvelope.result?.minimumGitVersion === 'string' &&
        JSON.stringify(compatibilityEnvelope.result?.repositoryFormatVersions) === '[1]',
      'The compatibility result is invalid.',
    );
    assertRuntimeInvariant(
      compatibilityEnvelope.cliVersion === '4.0.0' && compatibilityEnvelope.schemaVersion === 2,
      'The compatibility envelope is invalid.',
    );
    assertRuntimeInvariant(
      JSON.stringify(compatibilityEnvelope.result?.packages) ===
        JSON.stringify([
          { name: '@moldea.ai/adapter-anthropic', version: '2.0.3' },
          { name: '@moldea.ai/adapter-claude-agent-sdk', version: '1.0.2' },
          { name: '@moldea.ai/adapter-cloudflare-agents', version: '1.0.2' },
          { name: '@moldea.ai/adapter-eve', version: '1.0.2' },
          { name: '@moldea.ai/adapter-google-genai', version: '1.0.5' },
          { name: '@moldea.ai/adapter-langchain', version: '1.0.2' },
          { name: '@moldea.ai/adapter-langgraph', version: '1.0.2' },
          { name: '@moldea.ai/adapter-openai', version: '2.0.6' },
          { name: '@moldea.ai/adapter-openai-agents-sdk', version: '1.0.4' },
          { name: '@moldea.ai/adapter-vercel-ai-sdk', version: '1.0.2' },
          { name: '@moldea.ai/core', version: '2.0.1' },
          { name: '@moldea.ai/repository', version: '1.0.2' },
          { name: '@moldea.ai/repository-fs', version: '1.0.3' },
        ]),
      'The compatibility package list is invalid.',
    );
    assertRuntimeInvariant(
      JSON.stringify(compatibilityEnvelope.result?.adapters) ===
        JSON.stringify(
          [
            'anthropic',
            'claude-agent-sdk',
            'cloudflare-agents',
            'custom',
            'eve',
            'google-genai',
            'langchain',
            'langgraph',
            'openai',
            'openai-agents-sdk',
            'vercel-ai-sdk',
          ].map((id) => ({ id, repositoryFormatVersions: [1] })),
        ),
      'The executable adapter list is invalid.',
    );

    executeFixtureGit(consumerDirectory, hooksDirectory, environment, ['init']);
    await Promise.all([
      mkdir(path.join(consumerDirectory, 'moldea', 'agents', 'support'), { recursive: true }),
      mkdir(path.join(consumerDirectory, 'src'), { recursive: true }),
    ]);
    await writeFile(
      path.join(consumerDirectory, 'moldea', 'moldea.yaml'),
      [
        'version: 1',
        'agents:',
        '  support:',
        '    runtime:',
        '      id: claude-agent-sdk',
        '    bindings:',
        '      runtimeAgent:',
        '        path: /src/agent.ts',
        '        symbol: supportAgent',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(path.join(consumerDirectory, 'moldea', 'project.md'), '# Project\n', 'utf8');
    await writeFile(
      path.join(consumerDirectory, 'moldea', 'agents', 'support', 'description.md'),
      'Support agent.\n',
      'utf8',
    );
    await writeFile(
      path.join(consumerDirectory, 'moldea', 'agents', 'support', 'instruction.md'),
      'You are the `support` agent.\n',
      'utf8',
    );
    await writeFile(
      path.join(consumerDirectory, 'src', 'agent.ts'),
      [
        "import { query } from '@anthropic-ai/claude-agent-sdk';",
        "export const supportAgent = async () => query({ prompt: 'Help users.', options: {} });",
        '',
      ].join('\n'),
      'utf8',
    );
    const consumerManifest = JSON.parse(
      await readFile(path.join(consumerDirectory, 'package.json'), 'utf8'),
    );
    await writeFile(
      path.join(consumerDirectory, 'package.json'),
      `${JSON.stringify(
        {
          ...consumerManifest,
          dependencies: { '@anthropic-ai/claude-agent-sdk': '^0.3.234' },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
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
      JSON.stringify(
        inspectEnvelope.result?.inspection?.evidence?.map(({ kind, source }) => ({
          kind,
          source,
        })),
      ) ===
        JSON.stringify([
          { kind: 'language', source: 'claude-agent-sdk' },
          { kind: 'runtime-package', source: 'claude-agent-sdk' },
          { kind: 'runtime-pattern', source: 'claude-agent-sdk' },
        ]),
      'Inspection omitted the Claude Agent SDK adapter evidence.',
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
