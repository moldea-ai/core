// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { openAiAgentsSdkAdapter } from './index.js';

describe('openAiAgentsSdkAdapter', () => {
  test('publishes one immutable official adapter definition', () => {
    expect(openAiAgentsSdkAdapter.id).toBe('openai-agents-sdk');
    expect(openAiAgentsSdkAdapter.supportedRepositoryFormatVersions).toStrictEqual([1]);
    expect(Object.isFrozen(openAiAgentsSdkAdapter)).toBe(true);
    expect(Object.isFrozen(openAiAgentsSdkAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
