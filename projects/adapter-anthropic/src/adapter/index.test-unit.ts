// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { anthropicAdapter } from './index.js';

describe('anthropicAdapter', () => {
  test('publishes one immutable official adapter definition', () => {
    expect(anthropicAdapter.id).toBe('anthropic');
    expect(anthropicAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(anthropicAdapter)).toBe(true);
    expect(Object.isFrozen(anthropicAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
