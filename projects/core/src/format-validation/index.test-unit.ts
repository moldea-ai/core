// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  isCapabilityDescription,
  isDecisionPath,
  isNonEmptySingleLine,
  isRepositorySymbol,
  isRepositoryFormatWhitespace,
  isReservedId,
  isSimpleGlob,
  isStableId,
  isUnicodeScalarText,
  isVariableId,
  parseDecisionIdFromPath,
  sortRepositoryReferences,
  trimRepositoryFormatWhitespace,
} from './index.js';

describe('Core manifest-format validation', () => {
  test.each([
    ['plain text', true],
    ['astral 𐀀 text', true],
    ['\ud800', false],
    ['\udc00', false],
  ])('isUnicodeScalarText(%s) -> %s', (candidate, expected) => {
    expect(isUnicodeScalarText(candidate)).toBe(expected);
  });

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
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'com5',
    'com6',
    'com7',
    'com8',
    'com9',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
    'lpt5',
    'lpt6',
    'lpt7',
    'lpt8',
    'lpt9',
  ])('treats %s as a Windows-reserved ID', (candidate) => {
    expect(isReservedId(candidate)).toBe(true);
  });

  test.each(['console', 'printer', 'com0', 'com10', 'lpt0', 'lpt10', 'null'])(
    'does not overmatch the valid ID %s as Windows-reserved',
    (candidate) => {
      expect(isReservedId(candidate)).toBe(false);
    },
  );

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
    ['next line', '\u0085'],
    ['line separator', '\u2028'],
    ['paragraph separator', '\u2029'],
  ])('rejects %s in single-line values', (_name, lineBreak) => {
    expect(isNonEmptySingleLine(`before${lineBreak}after`)).toBe(false);
  });

  test.each([
    [0x0009, true],
    [0x000d, true],
    [0x0020, true],
    [0x0085, true],
    [0x00a0, true],
    [0x1680, true],
    [0x2000, true],
    [0x200a, true],
    [0x2028, true],
    [0x2029, true],
    [0x202f, true],
    [0x205f, true],
    [0x3000, true],
    [0x0008, false],
    [0x200b, false],
    [0xfeff, false],
  ])('uses the exact version 1 whitespace set for U+%s', (codePoint, expected) => {
    expect(isRepositoryFormatWhitespace(codePoint)).toBe(expected);
  });

  test('trims only version 1 whitespace from description edges', () => {
    expect(trimRepositoryFormatWhitespace('\u2000Description\u3000')).toBe('Description');
    expect(trimRepositoryFormatWhitespace('\ufeffDescription\ufeff')).toBe(
      '\ufeffDescription\ufeff',
    );
  });

  test('validates capability descriptions with Unicode whitespace and scalar limits', () => {
    expect(isCapabilityDescription('Retrieves order details.')).toBe(true);
    expect(isCapabilityDescription('\u2007Padded')).toBe(false);
    expect(isCapabilityDescription('Padded\u205f')).toBe(false);
    expect(isCapabilityDescription('line\u000bbreak')).toBe(true);
    expect(isCapabilityDescription('line\u000cbreak')).toBe(true);
    expect(isCapabilityDescription('line\u0085break')).toBe(false);
    expect(isCapabilityDescription('escaped\0nul')).toBe(false);
    expect(isCapabilityDescription('{{VALUE}}')).toBe(false);
    expect(isCapabilityDescription('😀'.repeat(1_000))).toBe(true);
    expect(isCapabilityDescription('😀'.repeat(1_001))).toBe(false);
  });

  test('rejects line breaks and NUL in parsed repository symbols', () => {
    expect(isRepositorySymbol('symbol')).toBe(true);
    expect(isRepositorySymbol('line\u000bbreak')).toBe(true);
    expect(isRepositorySymbol('line\u000cbreak')).toBe(true);
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
