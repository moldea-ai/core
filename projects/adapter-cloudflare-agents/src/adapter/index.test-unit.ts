// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { cloudflareAgentsAdapter } from './index.js';

describe('cloudflareAgentsAdapter', () => {
  test('publishes one immutable official adapter definition', () => {
    expect(cloudflareAgentsAdapter.id).toBe('cloudflare-agents');
    expect(cloudflareAgentsAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(cloudflareAgentsAdapter)).toBe(true);
    expect(Object.isFrozen(cloudflareAgentsAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
