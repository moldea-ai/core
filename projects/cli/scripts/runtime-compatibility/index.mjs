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
    assertRuntimeInvariant(cliManifest?.version === '3.3.2', 'The CLI version is invalid.');
    assertRuntimeInvariant(
      cliManifest?.engines?.node === '^22.11.0 || ^24.11.0',
      'The CLI runtime range is invalid.',
    );
    for (const packageName of [
      '@moldea.ai/adapter-anthropic',
      '@moldea.ai/adapter-claude-agent-sdk',
      '@moldea.ai/adapter-google-genai',
      '@moldea.ai/adapter-openai',
      '@moldea.ai/adapter-openai-agents-sdk',
      '@moldea.ai/adapter-cloudflare-agents',
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
    assertRuntimeInvariant(versionResult.stdout === '3.3.2\n', 'The version output is invalid.');

    const compatibilityResult = executeCli(
      executablePath,
      ['compatibility', '--json'],
      consumerDirectory,
      environment,
    );
    const compatibilityEnvelope = JSON.parse(compatibilityResult.stdout);
    const anthropicAdapter = compatibilityEnvelope.result?.adapters?.find(
      ({ id }) => id === 'anthropic',
    );
    const claudeAgentSdkAdapter = compatibilityEnvelope.result?.adapters?.find(
      ({ id }) => id === 'claude-agent-sdk',
    );
    const customAdapter = compatibilityEnvelope.result?.adapters?.find(({ id }) => id === 'custom');
    const googleGenAiAdapter = compatibilityEnvelope.result?.adapters?.find(
      ({ id }) => id === 'google-genai',
    );
    const openAiAdapter = compatibilityEnvelope.result?.adapters?.find(({ id }) => id === 'openai');
    const openAiAgentsSdkAdapter = compatibilityEnvelope.result?.adapters?.find(
      ({ id }) => id === 'openai-agents-sdk',
    );
    const cloudflareAgentsAdapter = compatibilityEnvelope.result?.adapters?.find(
      ({ id }) => id === 'cloudflare-agents',
    );
    const vercelAiSdkAdapter = compatibilityEnvelope.result?.adapters?.find(
      ({ id }) => id === 'vercel-ai-sdk',
    );

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
    assertRuntimeInvariant(
      compatibilityEnvelope.cliVersion === '3.3.2' &&
        compatibilityEnvelope.schemaVersion === 1 &&
        compatibilityEnvelope.result?.outputSchemaVersion === 1,
      'The compatibility envelope is invalid.',
    );
    assertRuntimeInvariant(
      JSON.stringify(compatibilityEnvelope.result?.packages) ===
        JSON.stringify([
          { name: '@moldea.ai/adapter-anthropic', version: '2.0.1' },
          { name: '@moldea.ai/adapter-claude-agent-sdk', version: '1.0.0' },
          { name: '@moldea.ai/adapter-google-genai', version: '1.0.3' },
          { name: '@moldea.ai/adapter-openai', version: '2.0.4' },
          { name: '@moldea.ai/adapter-openai-agents-sdk', version: '1.0.2' },
          { name: '@moldea.ai/adapter-cloudflare-agents', version: '1.0.0' },
          { name: '@moldea.ai/adapter-vercel-ai-sdk', version: '1.0.0' },
          { name: '@moldea.ai/core', version: '2.0.0' },
          { name: '@moldea.ai/repository', version: '1.0.1' },
          { name: '@moldea.ai/repository-fs', version: '1.0.2' },
        ]),
      'The compatibility package list is invalid.',
    );
    assertRuntimeInvariant(
      customAdapter?.active === true &&
        customAdapter.bundledVersion === '2.0.0' &&
        customAdapter.matrix?.implementationStatus === 'available' &&
        customAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        customAdapter.matrix?.runtimeGuidance?.expectation === 'required' &&
        JSON.stringify(customAdapter.matrix?.supportedRepositoryFormatVersions) === '[1]' &&
        customAdapter.matrix?.targets?.[0]?.id === 'custom' &&
        customAdapter.matrix?.targets?.[0]?.patterns?.[0]?.id ===
          'explicit-repository-relationships' &&
        customAdapter.matrix?.targets?.[0]?.patterns?.[0]?.support === 'full',
      'The custom compatibility claim is invalid.',
    );
    assertRuntimeInvariant(
      anthropicAdapter?.active === true &&
        anthropicAdapter.bundledVersion === '2.0.1' &&
        anthropicAdapter.matrix?.implementationStatus === 'available' &&
        anthropicAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        anthropicAdapter.matrix?.runtimeGuidance?.expectation === 'optional' &&
        JSON.stringify(anthropicAdapter.matrix?.supportedRepositoryFormatVersions) === '[1]' &&
        anthropicAdapter.matrix?.targets?.[0]?.id === 'typescript-messages-api-0-117' &&
        anthropicAdapter.matrix?.targets?.[0]?.supportLevel === 'experimental',
      'The Anthropic compatibility claim is invalid.',
    );
    assertRuntimeInvariant(
      claudeAgentSdkAdapter?.active === true &&
        claudeAgentSdkAdapter.bundledVersion === '1.0.0' &&
        claudeAgentSdkAdapter.matrix?.implementationStatus === 'available' &&
        claudeAgentSdkAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        claudeAgentSdkAdapter.matrix?.runtimeGuidance?.expectation === 'optional' &&
        JSON.stringify(claudeAgentSdkAdapter.matrix?.supportedRepositoryFormatVersions) === '[1]' &&
        claudeAgentSdkAdapter.matrix?.targets?.[0]?.id === 'typescript-query-subagents-0-3' &&
        claudeAgentSdkAdapter.matrix?.targets?.[0]?.supportLevel === 'experimental',
      'The Claude Agent SDK compatibility claim is invalid.',
    );
    assertRuntimeInvariant(
      googleGenAiAdapter?.active === true &&
        googleGenAiAdapter.bundledVersion === '1.0.3' &&
        googleGenAiAdapter.matrix?.implementationStatus === 'available' &&
        googleGenAiAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        googleGenAiAdapter.matrix?.runtimeGuidance?.expectation === 'optional' &&
        JSON.stringify(googleGenAiAdapter.matrix?.supportedRepositoryFormatVersions) === '[1]' &&
        googleGenAiAdapter.matrix?.targets?.[0]?.id === 'typescript-models-generate-content-2' &&
        googleGenAiAdapter.matrix?.targets?.[0]?.supportLevel === 'experimental',
      'The Google Gen AI compatibility claim is invalid.',
    );
    assertRuntimeInvariant(
      openAiAdapter?.active === true &&
        openAiAdapter.bundledVersion === '2.0.4' &&
        openAiAdapter.matrix?.implementationStatus === 'available' &&
        openAiAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        openAiAdapter.matrix?.runtimeGuidance?.expectation === 'recommended' &&
        JSON.stringify(openAiAdapter.matrix?.supportedRepositoryFormatVersions) === '[1]' &&
        openAiAdapter.matrix?.targets?.[0]?.id === 'typescript-responses-api-7' &&
        openAiAdapter.matrix?.targets?.[0]?.supportLevel === 'experimental',
      'The OpenAI compatibility claim is invalid.',
    );
    assertRuntimeInvariant(
      openAiAgentsSdkAdapter?.active === true &&
        openAiAgentsSdkAdapter.bundledVersion === '1.0.2' &&
        openAiAgentsSdkAdapter.matrix?.implementationStatus === 'available' &&
        openAiAgentsSdkAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        openAiAgentsSdkAdapter.matrix?.runtimeGuidance?.expectation === 'optional' &&
        JSON.stringify(openAiAgentsSdkAdapter.matrix?.supportedRepositoryFormatVersions) ===
          '[1]' &&
        openAiAgentsSdkAdapter.matrix?.targets?.[0]?.id === 'typescript-agent-handoffs-0-16' &&
        openAiAgentsSdkAdapter.matrix?.targets?.[0]?.supportLevel === 'experimental',
      'The OpenAI Agents SDK compatibility claim is invalid.',
    );
    assertRuntimeInvariant(
      cloudflareAgentsAdapter?.active === true &&
        cloudflareAgentsAdapter.bundledVersion === '1.0.0' &&
        cloudflareAgentsAdapter.matrix?.implementationStatus === 'available' &&
        cloudflareAgentsAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        cloudflareAgentsAdapter.matrix?.runtimeGuidance?.expectation === 'recommended' &&
        JSON.stringify(cloudflareAgentsAdapter.matrix?.supportedRepositoryFormatVersions) ===
          '[1]' &&
        cloudflareAgentsAdapter.matrix?.targets?.length === 2 &&
        cloudflareAgentsAdapter.matrix.targets.some(
          ({ id, supportLevel }) =>
            id === 'typescript-think-0-16-ai-sdk-7' && supportLevel === 'experimental',
        ) &&
        cloudflareAgentsAdapter.matrix.targets.some(
          ({ id, supportLevel }) =>
            id === 'typescript-ai-chat-agent-0-10-ai-sdk-7' && supportLevel === 'experimental',
        ),
      'The Cloudflare Agents adapter is not active with its expected compatibility metadata.',
    );
    assertRuntimeInvariant(
      vercelAiSdkAdapter?.active === true &&
        vercelAiSdkAdapter.bundledVersion === '1.0.0' &&
        vercelAiSdkAdapter.matrix?.implementationStatus === 'available' &&
        vercelAiSdkAdapter.matrix?.compatibleCoreRange === '^2.0.0' &&
        vercelAiSdkAdapter.matrix?.runtimeGuidance?.expectation === 'optional' &&
        JSON.stringify(vercelAiSdkAdapter.matrix?.supportedRepositoryFormatVersions) === '[1]' &&
        vercelAiSdkAdapter.matrix?.targets?.[0]?.id === 'typescript-generate-stream-text-7' &&
        vercelAiSdkAdapter.matrix?.targets?.[1]?.id === 'typescript-tool-loop-agent-7' &&
        vercelAiSdkAdapter.matrix?.targets?.every(
          ({ supportLevel }) => supportLevel === 'experimental',
        ),
      'The Vercel AI SDK compatibility claim is invalid.',
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
