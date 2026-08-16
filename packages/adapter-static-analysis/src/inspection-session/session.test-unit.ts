// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { createInspectionSession } from './session.js';

describe('createInspectionSession', () => {
  test('caches each provider operation by path', async () => {
    const analyzeSource = vi.fn((path: string, bytes: Uint8Array) => ({ bytes, path }));
    const discoverPackage = vi.fn((path: string) => Promise.resolve({ path }));
    const getEntry = vi.fn((path: string) => Promise.resolve({ path, type: 'file' }));
    const readFile = vi.fn(() => Promise.resolve(new Uint8Array([1, 2])));
    const session = createInspectionSession({
      analyzeSource,
      discoverPackage,
      getEntry,
      readFile,
    });

    await expect(
      Promise.all([session.analyzeSource('/a.ts'), session.analyzeSource('/a.ts')]),
    ).resolves.toStrictEqual([
      { bytes: new Uint8Array([1, 2]), path: '/a.ts' },
      { bytes: new Uint8Array([1, 2]), path: '/a.ts' },
    ]);
    await Promise.all([session.discoverPackage('/a.ts'), session.discoverPackage('/a.ts')]);
    await Promise.all([session.getEntry('/a.ts'), session.getEntry('/a.ts')]);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(analyzeSource).toHaveBeenCalledTimes(1);
    expect(discoverPackage).toHaveBeenCalledTimes(1);
    expect(getEntry).toHaveBeenCalledTimes(1);
  });

  test('rejects operations after cancellation', () => {
    const controller = new AbortController();
    controller.abort();
    const session = createInspectionSession({
      analyzeSource: vi.fn(),
      discoverPackage: vi.fn(() => Promise.resolve()),
      getEntry: vi.fn(() => Promise.resolve()),
      readFile: vi.fn(),
      signal: controller.signal,
    });

    expect(() => session.analyzeSource('/a.ts')).toThrow();
    expect(() => session.discoverPackage('/a.ts')).toThrow();
    expect(() => session.getEntry('/a.ts')).toThrow();
  });
});
