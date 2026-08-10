// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import { createCoreDiagnosticCollector } from './diagnostic-utilities.js';
import { createSourceLocator } from './source-location.js';
import { parseStrictYaml } from './yaml.js';

const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

const parse = (content: string) => {
  const diagnostics = createCoreDiagnosticCollector(DEFAULT_CORE_RESOURCE_LIMITS, 'parse-manifest');
  const parsed = parseStrictYaml(content, manifestPath, createSourceLocator(content), diagnostics);

  return { diagnostics: diagnostics.finalize(), parsed };
};

describe('Core strict YAML parsing', () => {
  test('uses YAML 1.2 Core Schema scalar semantics without exposing parser nodes', () => {
    const result = parse('legacy: yes\ndate: 2026-08-10\nenabled: true\ncount: 1\n');

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.parsed.valid).toBe(true);
    expect(result.parsed.value).toMatchObject({
      entries: [
        { key: { value: 'legacy' }, value: { value: 'yes' } },
        { key: { value: 'date' }, value: { value: '2026-08-10' } },
        { key: { value: 'enabled' }, value: { value: true } },
        { key: { value: 'count' }, value: { value: 1n } },
      ],
      kind: 'mapping',
    });
  });

  test('allows explicit standard Core Schema tags', () => {
    const result = parse('plain: !!int 1\nquoted: !!int "1"\nstring: !!str 1\n');

    expect(result.diagnostics).toStrictEqual([]);
    expect(result.parsed).toMatchObject({
      valid: true,
      value: {
        entries: [{ value: { value: 1n } }, { value: { value: 1n } }, { value: { value: '1' } }],
        kind: 'mapping',
      },
    });
  });

  test.each([
    ['directive', '%YAML 1.2\n---\nversion: 1\n', ['MOLDEA_YAML_FEATURE_UNSUPPORTED']],
    ['multiple documents', 'version: 1\n---\nversion: 1\n', ['MOLDEA_YAML_MULTIPLE_DOCUMENTS']],
    ['custom tag', 'version: !custom 1\n', ['MOLDEA_YAML_FEATURE_UNSUPPORTED']],
    ['duplicate key', 'version: 1\nversion: 1\n', ['MOLDEA_YAML_DUPLICATE_KEY']],
    ['malformed syntax', 'version: [1\n', ['MOLDEA_YAML_MALFORMED']],
    ['invalid standard tag value', 'value: !!int nope\n', ['MOLDEA_YAML_MALFORMED']],
    ['escaped surrogate', 'value: "\\uD800"\n', ['MOLDEA_YAML_MALFORMED']],
  ])('rejects %s', (_name, content, expectedCodes) => {
    const result = parse(content);

    expect(result.parsed).toStrictEqual({ valid: false, value: null });
    expect(result.diagnostics.map(({ code }) => code)).toStrictEqual(expectedCodes);
  });

  test('rejects anchors, aliases, and merge keys without expansion', () => {
    const result = parse('base: &base\n  value: 1\ncopy: *base\nmerged:\n  <<: *base\n');

    expect(result.parsed).toStrictEqual({ valid: false, value: null });
    expect(result.diagnostics.map(({ details }) => details['reason'])).toStrictEqual([
      'anchor',
      'alias',
      'merge-key',
      'alias',
    ]);
  });

  test('reports scalar-based source offsets after astral characters', () => {
    const result = parse('emoji: 😀\nversion: 1\nversion: 1\n');
    const duplicate = result.diagnostics.find(({ code }) => code === 'MOLDEA_YAML_DUPLICATE_KEY');

    expect(duplicate?.range?.start.offset).toBe(20);
    expect(duplicate?.range?.start.line).toBe(3);
  });
});
