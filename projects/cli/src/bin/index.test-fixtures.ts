import {
  execFileSync,
  spawnSync,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect } from 'vitest';

// package and build paths shared by the installed-executable tests
export const CLI_PROJECT_DIRECTORY = path.resolve(import.meta.dirname, '..', '..');
const projectsDirectory = path.dirname(CLI_PROJECT_DIRECTORY);
export const ADAPTER_ANTHROPIC_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-anthropic',
);
export const ADAPTER_CLAUDE_AGENT_SDK_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-claude-agent-sdk',
);
export const ADAPTER_GOOGLE_GENAI_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-google-genai',
);
export const ADAPTER_OPENAI_PROJECT_DIRECTORY = path.join(projectsDirectory, 'adapter-openai');
export const ADAPTER_OPENAI_AGENTS_SDK_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-openai-agents-sdk',
);
export const ADAPTER_CLOUDFLARE_AGENTS_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-cloudflare-agents',
);
export const ADAPTER_EVE_PROJECT_DIRECTORY = path.join(projectsDirectory, 'adapter-eve');
export const ADAPTER_LANGCHAIN_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-langchain',
);
export const ADAPTER_LANGGRAPH_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-langgraph',
);
export const ADAPTER_VERCEL_AI_SDK_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'adapter-vercel-ai-sdk',
);
export const CORE_PROJECT_DIRECTORY = path.join(projectsDirectory, 'core');
export const REPOSITORY_PROJECT_DIRECTORY = path.join(projectsDirectory, 'repository');
export const REPOSITORY_FILESYSTEM_PROJECT_DIRECTORY = path.join(
  projectsDirectory,
  'repository-fs',
);
export const CLI_DISTRIBUTION_PATH = path.join(CLI_PROJECT_DIRECTORY, 'dist', 'moldea.js');

// npm pack dry-run result used by the package-content assertion
export interface IPackDryRunResult {
  readonly files: readonly { readonly path: string }[];
  readonly name: string;
  readonly version: string;
}

// package fields observed at the source and packed-artifact boundaries
export interface IMoldeaCliPackageManifest {
  readonly bin?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
  readonly files?: readonly string[];
  readonly main?: string;
  readonly name?: string;
  readonly preferUnplugged?: boolean;
  readonly sideEffects?: boolean;
  readonly type?: string;
  readonly types?: string;
  readonly version?: string;
}

/** Executes native or JavaScript package-manager entrypoints without a platform shell. */
export const runPackageManager = (
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
export const spawnPackageManager = (
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
export const packPackageTarball = (
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
export const readTarEntry = (tarball: Buffer, entryPath: string): Buffer => {
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
export const expectPackageManifest = (
  manifest: IMoldeaCliPackageManifest,
  coreVersion: string,
  anthropicAdapterVersion: string,
  claudeAgentSdkAdapterVersion: string,
  googleGenAiAdapterVersion: string,
  langChainAdapterVersion: string,
  langGraphAdapterVersion: string,
  openAiAdapterVersion: string,
  openAiAgentsSdkAdapterVersion: string,
  cloudflareAgentsAdapterVersion: string,
  eveAdapterVersion: string,
  vercelAiSdkAdapterVersion: string,
  repositoryVersion: string,
  repositoryFilesystemVersion: string,
): void => {
  expect(manifest).toMatchObject({
    bin: { moldea: './dist/moldea.js' },
    engines: { node: '^22.11.0 || ^24.11.0' },
    exports: {},
    files: ['cover.png', 'dist', 'LICENSE', 'README.md'],
    name: '@moldea.ai/cli',
    preferUnplugged: true,
    type: 'module',
    version: '3.3.7',
  });
  expect(manifest.dependencies).toStrictEqual({
    '@moldea.ai/adapter-anthropic': anthropicAdapterVersion,
    '@moldea.ai/adapter-claude-agent-sdk': claudeAgentSdkAdapterVersion,
    '@moldea.ai/adapter-google-genai': googleGenAiAdapterVersion,
    '@moldea.ai/adapter-langchain': langChainAdapterVersion,
    '@moldea.ai/adapter-langgraph': langGraphAdapterVersion,
    '@moldea.ai/adapter-openai': openAiAdapterVersion,
    '@moldea.ai/adapter-openai-agents-sdk': openAiAgentsSdkAdapterVersion,
    '@moldea.ai/adapter-cloudflare-agents': cloudflareAgentsAdapterVersion,
    '@moldea.ai/adapter-eve': eveAdapterVersion,
    '@moldea.ai/adapter-vercel-ai-sdk': vercelAiSdkAdapterVersion,
    '@moldea.ai/core': coreVersion,
    '@moldea.ai/repository': repositoryVersion,
    '@moldea.ai/repository-fs': repositoryFilesystemVersion,
    semver: '7.8.5',
  });
  expect(manifest).not.toHaveProperty('main');
  expect(manifest).not.toHaveProperty('sideEffects');
  expect(manifest).not.toHaveProperty('types');
};

/** Reads the CLI source manifest used by package-content checks. */
export const readCliPackageManifest = (): IMoldeaCliPackageManifest =>
  JSON.parse(
    readFileSync(path.join(CLI_PROJECT_DIRECTORY, 'package.json'), 'utf8'),
  ) as IMoldeaCliPackageManifest;
