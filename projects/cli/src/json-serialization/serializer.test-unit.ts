// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { serializeJsonDeterministically } from './serializer.js';

describe('serializeJsonDeterministically', () => {
  test('sorts nested and integer-like keys by Unicode code point', () => {
    expect(
      serializeJsonDeterministically({
        '\u{10000}': 'astral',
        '\ue000': 'private-use',
        nested: { '2': 'two', '10': 'ten', a: true },
        array: [{ z: 2, a: 1 }, null],
      }),
    ).toBe(
      '{"array":[{"a":1,"z":2},null],"nested":{"10":"ten","2":"two","a":true},"":"private-use","𐀀":"astral"}',
    );
  });

  test('normalizes negative zero and supports null-prototype records', () => {
    const record = Object.assign(Object.create(null) as Record<string, unknown>, {
      negativeZero: -0,
    });

    expect(serializeJsonDeterministically(record)).toBe('{"negativeZero":0}');
  });

  test('uses standard JSON string escaping', () => {
    expect(serializeJsonDeterministically({ text: 'line\n"quoted"\\end' })).toBe(
      '{"text":"line\\n\\"quoted\\"\\\\end"}',
    );
  });

  test.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    Symbol('unsupported'),
    () => undefined,
    new Date(0),
    new Map(),
  ])('rejects unsupported value %s', (unsupportedValue) => {
    expect(() => serializeJsonDeterministically(unsupportedValue)).toThrow(TypeError);
  });

  test('rejects cycles and symbol keys', () => {
    const cyclicRecord: Record<string, unknown> = {};
    cyclicRecord['self'] = cyclicRecord;
    const symbolRecord = { ordinary: true };
    Object.defineProperty(symbolRecord, Symbol('private'), { enumerable: true, value: true });

    expect(() => serializeJsonDeterministically(cyclicRecord)).toThrow(TypeError);
    expect(() => serializeJsonDeterministically(symbolRecord)).toThrow(TypeError);
  });

  test('rejects sparse arrays instead of silently changing their shape', () => {
    expect(() => serializeJsonDeterministically(new Array(1))).toThrow(
      'The CLI JSON array must not contain empty slots.',
    );
  });
});
