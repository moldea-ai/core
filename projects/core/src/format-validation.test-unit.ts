// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  isCapabilityDescription,
  isDecisionPath,
  isNonEmptySingleLine,
  isRepositorySymbol,
  isSimpleGlob,
  isStableId,
  isVariableId,
  parseDecisionIdFromPath,
  sortRepositoryReferences,
} from './format-validation.js';

describe('Core manifest-format validation', () => {
  test.each([
    ['agent', true],
    ['agent-2', true],
    ['', false],
    ['Agent', false],
    ['agent--two', false],
    [`a${'b'.repeat(64)}`, false],
  ])('isStableId(%s) -> %s', (candidate, expected) => {
    expect(isStableId(candidate)).toBe(expected);
  });

  test.each([
    ['CURRENT_DATETIME', true],
    ['A1', true],
    ['current', false],
    ['_VALUE', false],
    [`A${'B'.repeat(64)}`, false],
  ])('isVariableId(%s) -> %s', (candidate, expected) => {
    expect(isVariableId(candidate)).toBe(expected);
  });

  test.each([
    [`/moldea/decisions/1786050123456-${'a'.repeat(64)}.md`, true],
    [`/moldea/decisions/1786050123456-${'a'.repeat(65)}.md`, false],
    ['/moldea/decisions/1786050123456-valid-slug.md', true],
    ['/moldea/decisions/nested/1786050123456-valid-slug.md', false],
  ])('isDecisionPath(%s) -> %s', (candidate, expected) => {
    expect(isDecisionPath(parseRepositoryPath(candidate))).toBe(expected);
  });

  test('extracts only canonical immediate decision IDs', () => {
    expect(
      parseDecisionIdFromPath(
        parseRepositoryPath('/moldea/decisions/1786131723456-use-postgresql.md'),
      ),
    ).toBe('1786131723456');
    expect(
      parseDecisionIdFromPath(
        parseRepositoryPath('/moldea/decisions/nested/1786131723456-use-postgresql.md'),
      ),
    ).toBeNull();
  });

  test.each([
    ['/src/**', true],
    ['/src/**/*.ts', true],
    ['/src/file-*.ts', true],
    ['/src/**x', false],
    ['/src/***', false],
    ['/src/file?.ts', false],
    ['/src/{a,b}.ts', false],
    ['/src/file.ts', false],
  ])('isSimpleGlob(%s) -> %s', (candidate, expected) => {
    expect(isSimpleGlob(candidate)).toBe(expected);
  });

  test.each([
    ['carriage return', '\r'],
    ['line feed', '\n'],
    ['vertical tab', '\u000b'],
    ['form feed', '\u000c'],
    ['next line', '\u0085'],
    ['line separator', '\u2028'],
    ['paragraph separator', '\u2029'],
  ])('rejects %s in single-line values', (_name, lineBreak) => {
    expect(isNonEmptySingleLine(`before${lineBreak}after`)).toBe(false);
  });

  test('validates capability descriptions with Unicode whitespace and scalar limits', () => {
    expect(isCapabilityDescription('Retrieves order details.')).toBe(true);
    expect(isCapabilityDescription('\u2007Padded')).toBe(false);
    expect(isCapabilityDescription('Padded\u205f')).toBe(false);
    expect(isCapabilityDescription('line\u000bbreak')).toBe(false);
    expect(isCapabilityDescription('line\u000cbreak')).toBe(false);
    expect(isCapabilityDescription('line\u0085break')).toBe(false);
    expect(isCapabilityDescription('escaped\0nul')).toBe(false);
    expect(isCapabilityDescription('{{VALUE}}')).toBe(false);
    expect(isCapabilityDescription('😀'.repeat(1_000))).toBe(true);
    expect(isCapabilityDescription('😀'.repeat(1_001))).toBe(false);
  });

  test('rejects line breaks and NUL in parsed repository symbols', () => {
    expect(isRepositorySymbol('symbol')).toBe(true);
    expect(isRepositorySymbol('line\u000bbreak')).toBe(false);
    expect(isRepositorySymbol('line\u000cbreak')).toBe(false);
    expect(isRepositorySymbol('escaped\0nul')).toBe(false);
  });

  test('sorts references by Unicode code point, path, and absent symbol', () => {
    const bmpPath = parseRepositoryPath('/\ue000');
    const astralPath = parseRepositoryPath('/𐀀');

    expect(
      sortRepositoryReferences([
        { path: astralPath },
        { path: bmpPath, symbol: 'z' },
        { path: bmpPath },
      ]),
    ).toStrictEqual([{ path: bmpPath }, { path: bmpPath, symbol: 'z' }, { path: astralPath }]);
  });
});
