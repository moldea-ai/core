import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { parseRuntimeCompatibilityMatrix } from '../../../../../scripts/runtime-compatibility/index.ts';
import type { IRuntimeCompatibilityMatrix } from '../../../../../scripts/runtime-compatibility/types.ts';

import { generateApiReference } from './api-reference.ts';
import type {
  IAdapterPage,
  IPackageDocument,
  IPublicPackage,
  ISearchRecord,
  IWebsiteModel,
} from '../model/types.ts';

const REPOSITORY_URL = 'https://github.com/moldea-ai/packages';
const EXCLUDED_DIRECTORY_NAMES = new Set(['_archive', '_archives', '_backup', '_backups']);
const GENERATED_NOTICE =
  'Generated from project manifests, package-owned documentation, public exports, and compatibility/runtimes.yaml. Do not edit generated output.';

const PackageManifestSchema = z.object({
  bin: z.record(z.string(), z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  description: z.string().min(1),
  engines: z.record(z.string(), z.string()).optional(),
  exports: z.record(
    z.string(),
    z.strictObject({
      default: z.string().optional(),
      import: z.string().optional(),
      style: z.string().optional(),
      types: z.string().optional(),
    }),
  ),
  name: z.string().regex(/^@moldea\.ai\/[a-z0-9-]+$/),
  private: z.boolean().optional(),
  publishConfig: z
    .strictObject({
      access: z.literal('public'),
    })
    .optional(),
  repository: z.strictObject({
    directory: z.string(),
    type: z.literal('git'),
    url: z.string(),
  }),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
});

const DocumentFrontmatterSchema = z.strictObject({
  description: z.string().min(1),
  navigationTitle: z.string().min(1).optional(),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
});

const getRepositoryRoot = (): string => {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
};

const parseJsonFile = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const parseDocument = (
  path: string,
  projectSlug: string,
  packageRoute: string,
  repositoryRoot: string,
): IPackageDocument => {
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(source);

  if (!match) {
    throw new Error(`${relative(repositoryRoot, path)} must start with YAML frontmatter.`);
  }

  const metadata = DocumentFrontmatterSchema.parse(parseYaml(match[1]));
  const relativeDocumentPath = relative(
    join(repositoryRoot, 'projects', projectSlug, 'docs'),
    path,
  );
  const sourceSlug = relativeDocumentPath.replaceAll(sep, '/').replace(/\.md$/, '');
  const slug = sourceSlug === 'index' ? '' : sourceSlug.replace(/\/index$/, '');
  const route = slug ? `${packageRoute}${slug}/` : packageRoute;

  return {
    description: metadata.description,
    markdown: match[2].trim(),
    navigationTitle: metadata.navigationTitle ?? metadata.title,
    order: metadata.order,
    route,
    slug,
    sourcePath: relative(repositoryRoot, path).replaceAll(sep, '/'),
    title: metadata.title,
  };
};

const listMarkdownFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !EXCLUDED_DIRECTORY_NAMES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  return entries.flatMap((entry): string[] => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return listMarkdownFiles(path);
    if (entry.isFile() && entry.name.endsWith('.md')) return [path];

    return [];
  });
};

/** Discovers implemented public projects and validates their package-owned documentation. */
export const discoverPublicPackages = (repositoryRoot: string): IPublicPackage[] => {
  const projectsDirectory = join(repositoryRoot, 'projects');
  const discovered = readdirSync(projectsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !EXCLUDED_DIRECTORY_NAMES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry): IPublicPackage[] => {
      const projectDirectory = join(projectsDirectory, entry.name);
      const manifestPath = join(projectDirectory, 'package.json');

      if (!existsSync(manifestPath)) return [];

      const manifest = PackageManifestSchema.parse(parseJsonFile(manifestPath));

      if (manifest.private === true || manifest.publishConfig?.access !== 'public') return [];
      if (!existsSync(join(projectDirectory, 'src'))) return [];
      if (manifest.repository.directory !== `projects/${entry.name}`) {
        throw new Error(`${manifest.name} repository.directory contradicts its project directory.`);
      }

      const expectedName = `@moldea.ai/${entry.name}`;

      if (manifest.name !== expectedName) {
        throw new Error(`${manifest.name} contradicts project identity ${expectedName}.`);
      }

      const family = manifest.name.startsWith('@moldea.ai/adapter-')
        ? 'runtime-adapters'
        : manifest.name === '@moldea.ai/website-ui'
          ? 'website-foundations'
          : 'skill-core-tooling';
      const route =
        family === 'runtime-adapters'
          ? `/adapters/${entry.name.replace(/^adapter-/, '')}/`
          : `/packages/${entry.name}/`;

      const docsDirectory = join(projectDirectory, 'docs');

      if (!existsSync(docsDirectory)) {
        throw new Error(`${manifest.name} is public and implemented but has no docs directory.`);
      }

      const documents = listMarkdownFiles(docsDirectory)
        .map((path) => parseDocument(path, entry.name, route, repositoryRoot))
        .sort((left, right) => left.order - right.order || left.route.localeCompare(right.route));

      if (!documents.some((document) => document.slug === '')) {
        throw new Error(`${manifest.name} documentation has no index.md.`);
      }

      const routeSet = new Set(documents.map(({ route }) => route));

      if (routeSet.size !== documents.length) {
        throw new Error(`${manifest.name} documentation resolves to duplicate routes.`);
      }

      const dependencies = Object.keys(manifest.dependencies ?? {})
        .filter((name) => name.startsWith('@moldea.ai/'))
        .sort();
      return [
        {
          api: generateApiReference(projectDirectory, manifest.exports),
          dependencies,
          dependents: [],
          description: manifest.description,
          documents,
          engines: manifest.engines ?? {},
          family,
          name: manifest.name,
          npmUrl: `https://www.npmjs.com/package/${manifest.name}`,
          repositoryDirectory: manifest.repository.directory,
          route,
          slug: entry.name,
          sourceUrl: `${REPOSITORY_URL}/tree/main/${manifest.repository.directory}`,
          version: manifest.version,
        },
      ];
    });

  const packageByName = new Map(
    discovered.map((packageModel) => [packageModel.name, packageModel]),
  );

  for (const packageModel of discovered) {
    for (const dependency of packageModel.dependencies) {
      const dependencyModel = packageByName.get(dependency);

      if (dependencyModel) dependencyModel.dependents.push(packageModel.name);
    }
  }

  for (const packageModel of discovered) packageModel.dependents.sort();

  return discovered;
};

const loadCompatibilityMatrix = (repositoryRoot: string): IRuntimeCompatibilityMatrix => {
  const source = readFileSync(join(repositoryRoot, 'compatibility/runtimes.yaml'), 'utf8');
  const result = parseRuntimeCompatibilityMatrix(source);

  if (!result.valid) {
    throw new Error(
      `Runtime Compatibility Matrix is invalid: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  return result.matrix;
};

/** Transforms the canonical matrix into validated public adapter status routes. */
export const buildAdapterPages = (
  matrix: IRuntimeCompatibilityMatrix,
  packages: IPublicPackage[],
): IAdapterPage[] => {
  const packageByName = new Map(packages.map((packageModel) => [packageModel.name, packageModel]));

  return Object.entries(matrix.adapters)
    .map(([id, entry]): IAdapterPage => {
      const implementedPackage =
        entry.implementation.kind === 'package'
          ? packageByName.get(entry.implementation.package)
          : undefined;

      if (entry.implementationStatus === 'available' && entry.implementation.kind === 'package') {
        if (!implementedPackage) {
          throw new Error(`Available adapter ${id} has no implemented public package.`);
        }
        if (implementedPackage.family !== 'runtime-adapters') {
          throw new Error(`Adapter ${id} implementation is not categorized as a runtime adapter.`);
        }
      }

      if (implementedPackage && entry.implementationStatus === 'planned') {
        throw new Error(
          `Implemented adapter package ${implementedPackage.name} is planned in the matrix.`,
        );
      }

      return {
        entry,
        id,
        implementedPackageSlug: implementedPackage?.slug ?? null,
        route: `/adapters/${id}/`,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
};

/** Creates the unique deterministic route manifest for generated and authored pages. */
export const createRouteManifest = (
  packages: IPublicPackage[],
  adapters: IAdapterPage[],
): string[] => {
  const routes = new Set<string>();
  const addRoute = (route: string): void => {
    if (routes.has(route)) throw new Error(`Two public content items resolve to ${route}.`);
    routes.add(route);
  };

  for (const route of [
    '/',
    '/404.html',
    '/adapters/',
    '/compatibility/',
    '/llms.txt',
    '/packages/',
    '/robots.txt',
    '/search/',
    '/search-index.json',
  ]) {
    addRoute(route);
  }

  for (const packageModel of packages) {
    for (const document of packageModel.documents) addRoute(document.route);
    if (packageModel.api.length > 0) addRoute(`${packageModel.route}api/`);
  }

  for (const adapter of adapters) {
    if (adapter.implementedPackageSlug) {
      if (!routes.has(adapter.route)) {
        throw new Error(`Implemented adapter ${adapter.id} has no package-owned canonical route.`);
      }
    } else {
      addRoute(adapter.route);
    }
  }

  return [...routes].sort();
};

const normalizeSearchText = (source: string): string =>
  source
    .replaceAll(/[^\p{L}\p{N}@._/:-]+/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

const describeAdapter = (adapter: IAdapterPage): string => {
  if (adapter.entry.implementation.kind === 'built-in') {
    return `${adapter.id} is an ${adapter.entry.implementationStatus} runtime adapter built into @moldea.ai/core.`;
  }

  return `${adapter.id} is an ${adapter.entry.implementationStatus} package-backed runtime adapter.`;
};

/** Creates deterministic public search records without maintaining a parallel content inventory. */
export const createSearchRecords = (
  packages: IPublicPackage[],
  adapters: IAdapterPage[],
): ISearchRecord[] => {
  const recordsByRoute = new Map<string, ISearchRecord>();

  for (const packageModel of packages) {
    for (const document of packageModel.documents) {
      recordsByRoute.set(document.route, {
        description: document.description,
        route: document.route,
        searchText: normalizeSearchText(
          [
            packageModel.name,
            packageModel.description,
            document.navigationTitle,
            document.markdown,
          ].join(' '),
        ),
        title:
          document.slug === '' ? packageModel.name : `${document.title} · ${packageModel.name}`,
      });
    }

    if (packageModel.api.length > 0) {
      recordsByRoute.set(`${packageModel.route}api/`, {
        description: `Public exports and signatures for ${packageModel.name}.`,
        route: `${packageModel.route}api/`,
        searchText: normalizeSearchText(
          packageModel.api
            .flatMap((entrypoint) => [
              entrypoint.name,
              ...entrypoint.symbols.flatMap((symbol) => [
                symbol.name,
                symbol.kind,
                symbol.description,
                symbol.signature,
              ]),
            ])
            .join(' '),
        ),
        title: `${packageModel.name} API reference`,
      });
    }
  }

  for (const adapter of adapters) {
    const existingRecord = recordsByRoute.get(adapter.route);
    const compatibilityText = normalizeSearchText(JSON.stringify(adapter.entry));

    recordsByRoute.set(adapter.route, {
      description: existingRecord?.description ?? describeAdapter(adapter),
      route: adapter.route,
      searchText: [
        existingRecord?.searchText,
        adapter.id,
        adapter.entry.implementationStatus,
        compatibilityText,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' '),
      title: existingRecord?.title ?? `${adapter.id} runtime adapter`,
    });
  }

  return [...recordsByRoute.values()].sort(
    (left, right) => left.route.localeCompare(right.route) || left.title.localeCompare(right.title),
  );
};

/** Creates the concise machine-oriented ecosystem map from generated public models. */
export const createLlmsText = (packages: IPublicPackage[], adapters: IAdapterPage[]): string => {
  const lines = [
    '# moldea packages',
    '',
    '> The open-source deterministic package foundation that powers moldea, the behavioral integrity layer for AI agents.',
    '',
    'This site documents repository-owned packages and runtime compatibility. The separate Agent Skill experience owns installation, workflows, tutorials, and developer onboarding.',
    '',
    '## Skill & Core Tooling',
    '',
  ];

  const orderedPackages = [...packages].sort((left, right) => left.name.localeCompare(right.name));
  const orderedAdapters = [...adapters].sort((left, right) => left.id.localeCompare(right.id));

  for (const packageModel of orderedPackages.filter(
    ({ family }) => family === 'skill-core-tooling',
  )) {
    const overview = packageModel.documents.find(({ slug }) => slug === '');
    lines.push(
      `- [${packageModel.name}](${packageModel.route}): ${overview?.description ?? packageModel.description}`,
    );
  }

  const adapterPackages = orderedPackages.filter(({ family }) => family === 'runtime-adapters');

  const websitePackages = orderedPackages.filter(({ family }) => family === 'website-foundations');

  if (websitePackages.length > 0) {
    lines.push('', '## Website Foundations', '');

    for (const packageModel of websitePackages) {
      const overview = packageModel.documents.find(({ slug }) => slug === '');
      lines.push(
        `- [${packageModel.name}](${packageModel.route}): ${overview?.description ?? packageModel.description}`,
      );
    }
  }

  if (adapterPackages.length > 0) {
    lines.push('', '## Runtime Adapter Packages', '');

    for (const packageModel of adapterPackages) {
      const overview = packageModel.documents.find(({ slug }) => slug === '');
      lines.push(
        `- [${packageModel.name}](${packageModel.route}): ${overview?.description ?? packageModel.description}`,
      );
    }
  }

  lines.push('', '## Package architecture', '');

  for (const packageModel of orderedPackages) {
    const dependencies = packageModel.dependencies.filter((name) =>
      orderedPackages.some((candidate) => candidate.name === name),
    );

    lines.push(
      dependencies.length > 0
        ? `- ${packageModel.name} -> ${dependencies.join(', ')}`
        : `- ${packageModel.name} -> foundational`,
    );
  }

  lines.push('', '## Runtime Adapters', '');

  for (const adapter of orderedAdapters) {
    const targetSummary =
      adapter.entry.targets?.map((target) => `${target.id}: ${target.supportLevel}`).join(', ') ??
      'no verified targets';
    const implementation =
      adapter.entry.implementation.kind === 'built-in'
        ? 'built into @moldea.ai/core'
        : adapter.entry.implementation.package;

    lines.push(
      `- [${adapter.id}](${adapter.route}): ${adapter.entry.implementationStatus}; ${implementation}; ${targetSummary}.`,
    );
  }

  lines.push(
    '',
    '## Canonical references',
    '',
    '- [Complete runtime compatibility matrix](/compatibility/)',
    `- [Source repository](${REPOSITORY_URL})`,
    '',
  );

  return lines.join('\n');
};

/**
 * Builds the complete deterministic website model without writing generated output.
 * @returns The validated package, documentation, API, adapter, route, and LLM model.
 */
export const createWebsiteModel = (): IWebsiteModel => {
  const repositoryRoot = getRepositoryRoot();
  const packages = discoverPublicPackages(repositoryRoot);
  const matrix = loadCompatibilityMatrix(repositoryRoot);
  const adapters = buildAdapterPages(matrix, packages);
  const routes = createRouteManifest(packages, adapters);
  const searchRecords = createSearchRecords(packages, adapters);

  return {
    adapters,
    generatedNotice: GENERATED_NOTICE,
    llmsText: createLlmsText(packages, adapters),
    packages,
    routes,
    searchRecords,
  };
};

/**
 * Writes the deterministic model consumed by Astro into the ignored application cache.
 * @param model Fully validated website model.
 * @returns A promise that resolves after the generated model is written.
 */
export const writeWebsiteModel = async (model: IWebsiteModel): Promise<void> => {
  const outputPath = join(getRepositoryRoot(), 'apps/website/.generated/model.json');

  await mkdir(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
};

/**
 * Reads the generated website model for static route generation.
 * @returns The previously generated deterministic website model.
 */
export const loadWebsiteModel = (): IWebsiteModel => {
  const path = join(getRepositoryRoot(), 'apps/website/.generated/model.json');

  if (!existsSync(path)) {
    throw new Error('Website model is missing. Run pnpm docs:generate first.');
  }

  return parseJsonFile(path) as IWebsiteModel;
};
