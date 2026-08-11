import { Parser, isAlias, isMap, isScalar, isSeq, parseAllDocuments, type ParsedNode } from 'yaml';

import type { IRepositoryPath } from '@moldea.ai/repository';

import type { ICoreDiagnosticCollector } from '../diagnostic-utilities/index.js';
import type { ISourceRange } from '../diagnostics/index.js';
import type { ISourceLocator } from '../source-location/index.js';

// parser-neutral YAML nodes retained only inside Core
export type IYamlNode = IYamlMappingNode | IYamlSequenceNode | IYamlScalarNode;

export interface IYamlMappingEntry {
  readonly key: IYamlNode;
  readonly value: IYamlNode;
}

export interface IYamlMappingNode {
  readonly kind: 'mapping';
  readonly entries: readonly IYamlMappingEntry[];
  readonly range: ISourceRange;
}

export interface IYamlSequenceNode {
  readonly kind: 'sequence';
  readonly items: readonly IYamlNode[];
  readonly range: ISourceRange;
}

export interface IYamlScalarNode {
  readonly kind: 'scalar';
  readonly range: ISourceRange;
  readonly source: string;
  readonly style: string | null;
  readonly value: string | number | bigint | boolean | null;
}

export interface IStrictYamlParseResult {
  readonly valid: boolean;
  readonly value: IYamlNode | null;
}

const CORE_TAGS = new Set([
  'tag:yaml.org,2002:bool',
  'tag:yaml.org,2002:float',
  'tag:yaml.org,2002:int',
  'tag:yaml.org,2002:map',
  'tag:yaml.org,2002:null',
  'tag:yaml.org,2002:seq',
  'tag:yaml.org,2002:str',
]);

const toRange = (
  range: readonly [number, number, number] | null | undefined,
  locator: ISourceLocator,
): ISourceRange => {
  return locator.locateRange(range?.[0] ?? 0, range?.[1] ?? range?.[0] ?? 0);
};

const addUnsupportedFeature = (
  diagnostics: ICoreDiagnosticCollector,
  path: IRepositoryPath,
  range: ISourceRange,
  reason: string,
): void => {
  diagnostics.add({
    code: 'MOLDEA_YAML_FEATURE_UNSUPPORTED',
    details: { reason },
    path,
    range,
  });
};

const isUnicodeScalarString = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);

      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        return false;
      }

      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
};

const isCoreTagCompatible = (node: ParsedNode): boolean => {
  switch (node.tag) {
    case 'tag:yaml.org,2002:bool':
      return isScalar(node) && typeof node.value === 'boolean';
    case 'tag:yaml.org,2002:float':
      return isScalar(node) && typeof node.value === 'number';
    case 'tag:yaml.org,2002:int':
      return isScalar(node) && typeof node.value === 'bigint';
    case 'tag:yaml.org,2002:map':
      return isMap(node);
    case 'tag:yaml.org,2002:null':
      return isScalar(node) && node.value === null;
    case 'tag:yaml.org,2002:seq':
      return isSeq(node);
    case 'tag:yaml.org,2002:str':
      return isScalar(node) && typeof node.value === 'string';
    default:
      return false;
  }
};

const convertNode = (
  node: ParsedNode,
  path: IRepositoryPath,
  locator: ISourceLocator,
  diagnostics: ICoreDiagnosticCollector,
): IYamlNode | null => {
  const range = toRange(node.range, locator);

  if (isAlias(node)) {
    addUnsupportedFeature(diagnostics, path, range, 'alias');
    return null;
  }

  if ('anchor' in node && typeof node.anchor === 'string') {
    addUnsupportedFeature(diagnostics, path, range, 'anchor');
  }

  if (node.tag !== undefined) {
    if (!CORE_TAGS.has(node.tag)) {
      addUnsupportedFeature(diagnostics, path, range, 'custom-tag');
      return null;
    }

    if (!isCoreTagCompatible(node)) {
      diagnostics.add({
        code: 'MOLDEA_YAML_MALFORMED',
        details: { reason: 'tag-value' },
        path,
        range,
      });
      return null;
    }
  }

  if (isScalar(node)) {
    const value = node.value;

    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'boolean'
    ) {
      diagnostics.add({
        code: 'MOLDEA_YAML_MALFORMED',
        details: { reason: 'scalar-type' },
        path,
        range,
      });
      return null;
    }

    if (typeof value === 'string' && !isUnicodeScalarString(value)) {
      diagnostics.add({
        code: 'MOLDEA_YAML_MALFORMED',
        details: { reason: 'invalid-unicode' },
        path,
        range,
      });
      return null;
    }

    return {
      kind: 'scalar',
      range,
      source: node.source,
      style: node.type ?? null,
      value,
    };
  }

  if (isSeq(node)) {
    const items: IYamlNode[] = [];

    for (const item of node.items) {
      if (item === null) {
        items.push({ kind: 'scalar', range, source: '', style: null, value: null });
        continue;
      }

      const converted = convertNode(item, path, locator, diagnostics);

      if (converted !== null) {
        items.push(converted);
      }
    }

    return { items, kind: 'sequence', range };
  }

  if (isMap(node)) {
    const entries: IYamlMappingEntry[] = [];

    for (const pair of node.items) {
      const key = convertNode(pair.key, path, locator, diagnostics);
      const value =
        pair.value === null
          ? ({
              kind: 'scalar',
              range: key?.range ?? range,
              source: '',
              style: null,
              value: null,
            } satisfies IYamlScalarNode)
          : convertNode(pair.value, path, locator, diagnostics);

      if (key?.kind === 'scalar' && key.value === '<<' && key.style === 'PLAIN') {
        addUnsupportedFeature(diagnostics, path, key.range, 'merge-key');
      }

      if (key !== null && value !== null) {
        entries.push({ key, value });
      }
    }

    return { entries, kind: 'mapping', range };
  }

  diagnostics.add({
    code: 'MOLDEA_YAML_MALFORMED',
    details: { reason: 'node-type' },
    path,
    range,
  });
  return null;
};

const addParserDiagnostic = (
  code: string,
  start: number,
  end: number,
  path: IRepositoryPath,
  locator: ISourceLocator,
  diagnostics: ICoreDiagnosticCollector,
): void => {
  if (code === 'BAD_DIRECTIVE') {
    return;
  }

  if (code === 'DUPLICATE_KEY') {
    diagnostics.add({
      code: 'MOLDEA_YAML_DUPLICATE_KEY',
      path,
      range: locator.locateRange(start, end),
    });
    return;
  }

  if (code === 'TAG_RESOLVE_FAILED') {
    return;
  }

  diagnostics.add({
    code: 'MOLDEA_YAML_MALFORMED',
    details: { reason: code === 'RESOURCE_EXHAUSTION' ? 'resource-exhaustion' : 'syntax' },
    path,
    range: locator.locateRange(start, end),
  });
};

/**
 * Parses one normalized YAML 1.2 Core Schema document into parser-neutral nodes.
 * @param value The normalized manifest text.
 * @param path The logical source path used by diagnostics.
 * @param locator The scalar-aware source locator for the normalized text.
 * @param diagnostics The operation diagnostic collector.
 * @returns The private parsed tree only when the YAML substrate is trustworthy.
 */
export const parseStrictYaml = (
  value: string,
  path: IRepositoryPath,
  locator: ISourceLocator,
  diagnostics: ICoreDiagnosticCollector,
): IStrictYamlParseResult => {
  const initialDiagnosticCount = diagnostics.size;

  for (const token of new Parser().parse(value)) {
    if (token.type === 'directive') {
      addUnsupportedFeature(
        diagnostics,
        path,
        locator.locateRange(token.offset, token.offset + token.source.length),
        'directive',
      );
    }
  }

  const documents = parseAllDocuments(value, {
    intAsBigInt: true,
    keepSourceTokens: true,
    logLevel: 'silent',
    merge: false,
    prettyErrors: false,
    resolveKnownTags: false,
    schema: 'core',
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });

  if (documents.length > 1) {
    const secondDocument = documents[1];
    const range = secondDocument?.range;

    diagnostics.add({
      code: 'MOLDEA_YAML_MULTIPLE_DOCUMENTS',
      path,
      range: locator.locateRange(range?.[0] ?? 0, range?.[0] ?? 0),
    });
  }

  for (const document of documents) {
    for (const error of [...document.errors, ...document.warnings]) {
      addParserDiagnostic(error.code, error.pos[0], error.pos[1], path, locator, diagnostics);
    }
  }

  if (documents.length > 1 || diagnostics.size > initialDiagnosticCount) {
    return { valid: false, value: null };
  }

  const document = documents[0];

  if (document === undefined || document.contents === null) {
    return {
      valid: true,
      value: {
        kind: 'scalar',
        range: locator.locateRange(0, 0),
        source: '',
        style: null,
        value: null,
      },
    };
  }

  const parsedValue = convertNode(document.contents, path, locator, diagnostics);

  return {
    valid: parsedValue !== null && diagnostics.size === initialDiagnosticCount,
    value: diagnostics.size === initialDiagnosticCount ? parsedValue : null,
  };
};
