// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createTestCompatibilityState } from './compatibility.test-fixtures.js';
import { createMoldeaCliCompatibilityResult } from './transformers.js';

describe('createMoldeaCliCompatibilityResult', () => {
  test('reports only executable technical compatibility state', () => {
    const result = createMoldeaCliCompatibilityResult(createTestCompatibilityState());

    expect(result).toMatchObject({
      minimumGitVersion: '2.30.0',
      repositoryFormatVersions: [1],
      supportedNodeRange: '^22.11.0 || ^24.11.0',
    });
    expect(result.adapters).toHaveLength(11);
    expect(result.adapters[0]).toStrictEqual({
      id: 'anthropic',
      repositoryFormatVersions: [1],
    });
    expect(result.adapters.find(({ id }) => id === 'custom')).toStrictEqual({
      id: 'custom',
      repositoryFormatVersions: [1],
    });
    expect(result.packages).toContainEqual({
      name: '@moldea.ai/adapter-openai',
      version: '2.0.6',
    });
    expect(JSON.stringify(result)).not.toContain('maturity');
    expect(JSON.stringify(result)).not.toContain('matrix');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.adapters)).toBe(true);
    expect(Object.isFrozen(result.adapters[0])).toBe(true);
  });
});
