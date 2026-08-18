import { defineConfig, type ViteUserConfig } from 'vitest/config';

// cross-platform allowance for package, filesystem, and process integration work
const INTEGRATION_TEST_TIMEOUT_MS = 20_000;

// supported correctness-test categories and shared test-config inputs
export type ITestSuiteKind = 'e2e' | 'integration' | 'unit';

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
      ...(options.suite === 'integration' ? { testTimeout: INTEGRATION_TEST_TIMEOUT_MS } : {}),
      sequence: {
        shuffle: false,
      },
      unstubEnvs: true,
      unstubGlobals: true,
    },
  });
};
