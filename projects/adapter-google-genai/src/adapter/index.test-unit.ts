// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { googleGenAiAdapter } from './index.js';

describe('googleGenAiAdapter', () => {
  test('publishes one immutable official adapter definition', () => {
    expect(googleGenAiAdapter.id).toBe('google-genai');
    expect(googleGenAiAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(googleGenAiAdapter)).toBe(true);
    expect(Object.isFrozen(googleGenAiAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
