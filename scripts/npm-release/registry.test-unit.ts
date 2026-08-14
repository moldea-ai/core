// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { loadNpmRegistryVersions, parseNpmRegistryVersions } from './registry.ts';

describe('npm release registry access', () => {
  test('parses exact published versions', () => {
    expect(
      parseNpmRegistryVersions(
        {
          name: '@moldea.ai/core',
          versions: { '1.0.0': {}, '1.1.0': {} },
        },
        '@moldea.ai/core',
      ),
    ).toStrictEqual(['1.0.0', '1.1.0']);
  });

  test.each([
    ['wrong identity', { name: '@moldea.ai/other', versions: { '1.0.0': {} } }],
    ['invalid collection', { name: '@moldea.ai/core', versions: ['1.0.0'] }],
    ['invalid version', { name: '@moldea.ai/core', versions: { latest: {} } }],
  ])('rejects an %s', (_description, metadata) => {
    expect(() => parseNpmRegistryVersions(metadata, '@moldea.ai/core')).toThrow('registry');
  });

  test('returns an empty inventory for an unpublished package', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));

    await expect(loadNpmRegistryVersions('@moldea.ai/core', request)).resolves.toStrictEqual([]);
    expect(request).toHaveBeenCalledWith(
      new URL('https://registry.npmjs.org/%40moldea.ai%2Fcore'),
      { headers: { accept: 'application/json' } },
    );
  });

  test('loads published metadata without authentication', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        name: '@moldea.ai/core',
        versions: { '1.0.0': {} },
      }),
    );

    await expect(loadNpmRegistryVersions('@moldea.ai/core', request)).resolves.toStrictEqual([
      '1.0.0',
    ]);
  });

  test('rejects an unsuccessful registry response', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(loadNpmRegistryVersions('@moldea.ai/core', request)).rejects.toThrow(
      'failed with 503',
    );
  });
});
