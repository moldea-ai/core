// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { eveAdapter } from './index.js';

describe('eveAdapter', () => {
  test('exposes the immutable official adapter contract', () => {
    expect(eveAdapter.id).toBe('eve');
    expect(typeof eveAdapter.inspect).toBe('function');
    expect(eveAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(eveAdapter)).toBe(true);
    expect(Object.isFrozen(eveAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
