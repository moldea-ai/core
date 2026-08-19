// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { vercelAiSdkAdapter } from './index.js';

describe('vercelAiSdkAdapter', () => {
  test('publishes one immutable official adapter definition', () => {
    expect(vercelAiSdkAdapter.id).toBe('vercel-ai-sdk');
    expect(vercelAiSdkAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(vercelAiSdkAdapter)).toBe(true);
    expect(Object.isFrozen(vercelAiSdkAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
