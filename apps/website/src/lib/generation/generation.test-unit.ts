// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';

import {
  buildAdapterPages,
  createLlmsText,
  createRouteManifest,
  createSearchRecords,
  createWebsiteModel,
  discoverPublicPackages,
} from './generation.ts';
import type { IRuntimeCompatibilityMatrix } from '../../../../../scripts/runtime-compatibility/types.ts';

const temporaryDirectories: string[] = [];

const createTemporaryRepository = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'moldea-website-generation-'));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, 'projects'), { recursive: true });

  return directory;
};

const writeProject = (
  repositoryRoot: string,
  slug: string,
  options: {
    dependencies?: Record<string, string>;
    documents?: Record<string, string>;
    hasSource?: boolean;
    isPrivate?: boolean;
  } = {},
): void => {
  const projectDirectory = join(repositoryRoot, 'projects', slug);
  mkdirSync(projectDirectory, { recursive: true });
  writeFileSync(
    join(projectDirectory, 'package.json'),
    JSON.stringify({
      name: `@moldea.ai/${slug}`,
      version: '1.0.0',
      description: `${slug} package`,
      private: options.isPrivate,
      exports: {},
      dependencies: options.dependencies,
      publishConfig: { access: 'public' },
      repository: {
        type: 'git',
        url: 'git+https://github.com/moldea-ai/packages.git',
        directory: `projects/${slug}`,
      },
    }),
  );

  if (options.hasSource !== false) {
    mkdirSync(join(projectDirectory, 'src'), { recursive: true });
    writeFileSync(join(projectDirectory, 'src', 'index.ts'), 'export const implemented = true;\n');
  }

  if (options.documents) {
    for (const [relativePath, title] of Object.entries(options.documents)) {
      const path = join(projectDirectory, 'docs', relativePath);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(
        path,
        `---\ntitle: ${title}\ndescription: ${title} documentation.\norder: 0\n---\n\n# ${title}\n`,
      );
    }
  }
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('discoverPublicPackages', () => {
  test('discovers the complete current public implementation set and package families', () => {
    const model = createWebsiteModel();

    expect(model.packages.map(({ name }) => name)).toStrictEqual([
      '@moldea.ai/adapter-openai',
      '@moldea.ai/cli',
      '@moldea.ai/core',
      '@moldea.ai/repository',
      '@moldea.ai/repository-fs',
    ]);
    expect(model.packages.find(({ slug }) => slug === 'adapter-openai')?.family).toBe(
      'runtime-adapters',
    );
    expect(
      model.packages
        .filter(({ family }) => family === 'skill-core-tooling')
        .map(({ slug }) => slug),
    ).toStrictEqual(['cli', 'core', 'repository', 'repository-fs']);
  });

  test('excludes private and source-less projects before requiring public documentation', () => {
    const repositoryRoot = createTemporaryRepository();
    writeProject(repositoryRoot, 'public-package', { documents: { 'index.md': 'Public' } });
    writeProject(repositoryRoot, 'private-package', { isPrivate: true });
    writeProject(repositoryRoot, 'planned-package', {
      documents: { 'index.md': 'Planned' },
      hasSource: false,
    });

    expect(discoverPublicPackages(repositoryRoot).map(({ slug }) => slug)).toStrictEqual([
      'public-package',
    ]);
  });

  test('fails when an implemented public project has no package-owned documentation', () => {
    const repositoryRoot = createTemporaryRepository();
    writeProject(repositoryRoot, 'undocumented');

    expect(() => discoverPublicPackages(repositoryRoot)).toThrow(
      '@moldea.ai/undocumented is public and implemented but has no docs directory.',
    );
  });

  test('rejects duplicate documentation routes', () => {
    const repositoryRoot = createTemporaryRepository();
    writeProject(repositoryRoot, 'duplicate-docs', {
      documents: {
        'a.md': 'A',
        'a/index.md': 'Nested A',
        'index.md': 'Overview',
      },
    });

    expect(() => discoverPublicPackages(repositoryRoot)).toThrow(
      '@moldea.ai/duplicate-docs documentation resolves to duplicate routes.',
    );
  });

  test('derives dependency and dependent relationships from manifests', () => {
    const repositoryRoot = createTemporaryRepository();
    writeProject(repositoryRoot, 'foundation', { documents: { 'index.md': 'Foundation' } });
    writeProject(repositoryRoot, 'consumer', {
      dependencies: { '@moldea.ai/foundation': 'workspace:^1.0.0' },
      documents: { 'index.md': 'Consumer' },
    });

    const packages = discoverPublicPackages(repositoryRoot);

    expect(packages.find(({ slug }) => slug === 'consumer')?.dependencies).toStrictEqual([
      '@moldea.ai/foundation',
    ]);
    expect(packages.find(({ slug }) => slug === 'foundation')?.dependents).toStrictEqual([
      '@moldea.ai/consumer',
    ]);
  });
});

describe('adapter and route generation', () => {
  test('preserves planned, built-in available, and experimental package-backed states', () => {
    const model = createWebsiteModel();
    const custom = model.adapters.find(({ id }) => id === 'custom');
    const openAi = model.adapters.find(({ id }) => id === 'openai');
    const anthropic = model.adapters.find(({ id }) => id === 'anthropic');

    expect(custom).toMatchObject({
      implementedPackageSlug: null,
      entry: { implementationStatus: 'available', implementation: { kind: 'built-in' } },
    });
    expect(openAi).toMatchObject({
      implementedPackageSlug: 'adapter-openai',
      entry: {
        implementationStatus: 'available',
        targets: [{ supportLevel: 'experimental' }],
      },
    });
    expect(anthropic).toMatchObject({
      implementedPackageSlug: null,
      entry: { implementationStatus: 'planned' },
    });
    expect(anthropic && 'targets' in anthropic.entry).toBe(false);
  });

  test('rejects an available package-backed adapter without an implemented package', () => {
    const matrix: IRuntimeCompatibilityMatrix = {
      version: 1,
      adapters: {
        missing: {
          implementation: {
            distribution: 'public',
            kind: 'package',
            package: '@moldea.ai/adapter-missing',
          },
          implementationStatus: 'available',
        },
      },
    };

    expect(() => buildAdapterPages(matrix, [])).toThrow(
      'Available adapter missing has no implemented public package.',
    );
  });

  test('rejects two package documents resolving to one route', () => {
    const model = createWebsiteModel();
    const first = {
      ...model.packages[0],
      api: [],
      documents: [{ ...model.packages[0].documents[0], route: '/collision/' }],
    };
    const second = {
      ...model.packages[1],
      api: [],
      documents: [{ ...model.packages[1].documents[0], route: '/collision/' }],
    };

    expect(() => createRouteManifest([first, second], [])).toThrow(
      'Two public content items resolve to /collision/.',
    );
  });
});

describe('createLlmsText', () => {
  test('is deterministic under reversed source enumeration', () => {
    const model = createWebsiteModel();

    expect(createLlmsText([...model.packages].reverse(), [...model.adapters].reverse())).toBe(
      createLlmsText(model.packages, model.adapters),
    );
  });

  test('represents every public package and canonical adapter without exposing the website package', () => {
    const model = createWebsiteModel();
    const text = createLlmsText(model.packages, model.adapters);
    const lines = text.split('\n');

    for (const packageModel of model.packages) {
      const overview = packageModel.documents.find(({ slug }) => slug === '');

      expect(text).toContain(
        `- [${packageModel.name}](${packageModel.route}): ${overview?.description}`,
      );
    }

    for (const adapter of model.adapters) {
      const line = lines.find((candidate) => candidate.startsWith(`- [${adapter.id}](`));

      expect(line).toContain(`): ${adapter.entry.implementationStatus};`);
      for (const target of adapter.entry.targets ?? []) {
        expect(line).toContain(`${target.id}: ${target.supportLevel}`);
      }
    }

    const internalLinks = [...text.matchAll(/\[[^\]]+\]\((\/[^)\s]+)\)/g)].map((match) => match[1]);

    expect(internalLinks.length).toBeGreaterThan(0);
    for (const route of internalLinks) expect(model.routes).toContain(route);
    expect(text).not.toContain('@moldea.ai/packages-website');
    expect(text).toContain('available; built into @moldea.ai/core; custom: supported');
    expect(text).toContain('typescript-responses-api-7: experimental');
  });
});

describe('createSearchRecords', () => {
  test('represents every public package and canonical adapter', () => {
    const model = createWebsiteModel();
    const searchRecords = createSearchRecords(model.packages, model.adapters);

    for (const packageModel of model.packages) {
      expect(
        searchRecords.some(
          (record) =>
            record.title.includes(packageModel.name) ||
            record.searchText.includes(packageModel.name),
        ),
      ).toBe(true);
    }

    for (const adapter of model.adapters) {
      expect(searchRecords.some(({ route }) => route === adapter.route)).toBe(true);
    }

    expect(searchRecords.some(({ searchText }) => searchText.includes('experimental'))).toBe(true);
    expect(JSON.stringify(searchRecords)).not.toContain('@moldea.ai/packages-website');
  });

  test('is deterministic under reversed source enumeration', () => {
    const model = createWebsiteModel();

    expect(
      createSearchRecords([...model.packages].reverse(), [...model.adapters].reverse()),
    ).toStrictEqual(createSearchRecords(model.packages, model.adapters));
  });
});
