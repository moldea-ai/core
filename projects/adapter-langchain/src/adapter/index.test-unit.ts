// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { langChainAdapter } from './index.js';

describe('langChainAdapter', () => {
  test('publishes one deeply immutable runtime adapter contract', () => {
    expect(langChainAdapter).toMatchObject({
      id: 'langchain',
      supportedRepositoryFormatVersions: [1],
    });
    expect(Object.isFrozen(langChainAdapter)).toBe(true);
    expect(Object.isFrozen(langChainAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
