import { defineConfig, type ViteUserConfig } from 'vitest/config';

export type ITestSuiteKind = 'integration' | 'unit';

export interface ITestConfigOptions {
  readonly include?: readonly string[];
  readonly suite: ITestSuiteKind;
}

/**
 * Creates the shared Node.js Vitest configuration for one package test suite.
 * @param options The suite kind and optional package-specific file patterns.
 * @returns A deterministic Vitest configuration without global test APIs.
 */
export const createTestConfig = (options: ITestConfigOptions): ViteUserConfig => {
  const include = options.include ?? [`src/**/*.test-${options.suite}.ts`];

  return defineConfig({
    test: {
      clearMocks: true,
      environment: 'node',
      globals: false,
      include: [...include],
      passWithNoTests: false,
      restoreMocks: true,
      sequence: {
        shuffle: false,
      },
      unstubEnvs: true,
      unstubGlobals: true,
    },
  });
};
