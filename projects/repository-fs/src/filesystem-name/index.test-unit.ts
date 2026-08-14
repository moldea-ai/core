// @vitest-environment node
import { Buffer } from 'node:buffer';
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { decodeFilesystemName } from './index.js';

const parentPath = parseRepositoryPath('/parent');

describe('filesystem name decoding', () => {
  test.each(['file.txt', 'naïve.txt', '文件.yaml', '﻿prefixed'])(
    'decodeFilesystemName(%s) preserves the source spelling',
    (name) => {
      expect(decodeFilesystemName(Buffer.from(name, 'utf8'), parentPath)).toBe(name);
    },
  );

  test('does not normalize canonically equivalent names', () => {
    const composedName = 'é.txt';
    const decomposedName = 'é.txt';

    expect(decodeFilesystemName(Buffer.from(composedName), parentPath)).toBe(composedName);
    expect(decodeFilesystemName(Buffer.from(decomposedName), parentPath)).toBe(decomposedName);
    expect(composedName).not.toBe(decomposedName);
  });

  test.each([
    Buffer.from([0x80]),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xe2, 0x82]),
    Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.from([0xf4, 0x90, 0x80, 0x80]),
  ])('rejects invalid UTF-8 bytes %o', (encodedName) => {
    expectToThrowCode(
      () => decodeFilesystemName(encodedName, parentPath),
      'INVALID_SOURCE_DATA',
      'The repository source returned invalid data.',
    );
  });

  test.each(['', '.', '..', 'nested/name', 'back\\slash', 'control\u0001', 'delete\u007f'])(
    'rejects an unrepresentable logical segment %s',
    (name) => {
      expectToThrowCode(
        () => decodeFilesystemName(Buffer.from(name), parentPath),
        'INVALID_SOURCE_DATA',
        'The repository source returned invalid data.',
      );
    },
  );

  test('reports the nearest safe parent without exposing raw bytes', () => {
    let rejection: unknown;

    try {
      decodeFilesystemName(Buffer.from([0x80]), parentPath);
    } catch (cause) {
      rejection = cause;
    }

    expect(rejection).toMatchObject({ path: parentPath, retryable: false });
    expect(JSON.stringify(rejection)).not.toContain('128');
  });
});
