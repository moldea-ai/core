// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { openAiAdapter } from './index.js';

describe('openAiAdapter', () => {
  test('publishes one immutable official adapter definition', () => {
    expect(openAiAdapter.id).toBe('openai');
    expect(openAiAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(openAiAdapter)).toBe(true);
    expect(Object.isFrozen(openAiAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
