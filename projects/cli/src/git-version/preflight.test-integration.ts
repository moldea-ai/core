// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createGitVersionPreflight } from './preflight.js';

describe('Git version preflight integration', () => {
  test('accepts the installed Git executable through the production process boundary', async () => {
    const result = await createGitVersionPreflight()();

    expect(result.kind).toBe('supported');
    expect(Object.isFrozen(result)).toBe(true);
  });
});
