// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { langGraphAdapter } from './index.js';

describe('langGraphAdapter', () => {
  test('publishes one deeply immutable runtime adapter contract', () => {
    expect(langGraphAdapter).toMatchObject({
      id: 'langgraph',
      supportedRepositoryFormatVersions: [1],
    });
    expect(Object.isFrozen(langGraphAdapter)).toBe(true);
    expect(Object.isFrozen(langGraphAdapter.supportedRepositoryFormatVersions)).toBe(true);
  });
});
