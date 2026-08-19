// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { claudeAgentSdkAdapter } from './index.js';

describe('claudeAgentSdkAdapter', () => {
  test('publishes one immutable official adapter definition', () => {
    expect(claudeAgentSdkAdapter.id).toBe('claude-agent-sdk');
    expect(claudeAgentSdkAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(claudeAgentSdkAdapter)).toBe(true);
    expect(Object.isFrozen(claudeAgentSdkAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
