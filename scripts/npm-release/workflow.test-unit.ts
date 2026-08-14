// @vitest-environment node
import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';

// workflow fields inspected as durable release-security contracts
interface IWorkflowJob {
  environment?: string;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  uses?: string;
  with?: Record<string, unknown>;
}

interface IWorkflow {
  jobs?: Record<string, IWorkflowJob>;
  on?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
}

const repositoryRoot = new URL('../../', import.meta.url);
const ciSource = readFileSync(new URL('.github/workflows/ci.yml', repositoryRoot), 'utf8');
const publishSource = readFileSync(
  new URL('.github/workflows/publish.yml', repositoryRoot),
  'utf8',
);
const ciWorkflow = parse(ciSource) as IWorkflow;
const publishWorkflow = parse(publishSource) as IWorkflow;

describe('npm release workflow', () => {
  test('reuses the complete CI boundary with release caching disabled', () => {
    expect(ciWorkflow.on).toHaveProperty('workflow_call');
    expect(ciSource).toContain('release_build:');
    expect(ciSource).toContain('name: public-package-tarballs');
    expect(ciSource).toContain('SHA256SUMS');
    expect(ciSource.match(/name: public-package-tarballs/gu)).toHaveLength(3);
  });

  test('exposes only a manual package and release-mode boundary', () => {
    expect(publishWorkflow.on).toStrictEqual({
      workflow_dispatch: {
        inputs: {
          mode: {
            description:
              'Bootstrap creates the tag and artifact; trusted also publishes through OIDC.',
            options: ['bootstrap', 'trusted'],
            required: true,
            type: 'choice',
          },
          project: {
            description: 'Public package project to release.',
            options: ['repository', 'repository-fs', 'core', 'cli'],
            required: true,
            type: 'choice',
          },
        },
      },
    });
    expect(publishWorkflow.permissions).toStrictEqual({});
  });

  test('gates tagging and publishing on the same complete CI run', () => {
    expect(publishWorkflow.jobs?.['verify']).toMatchObject({
      permissions: { contents: 'read' },
      uses: './.github/workflows/ci.yml',
      with: { release_build: true, release_project: '${{ inputs.project }}' },
    });
    expect(publishWorkflow.jobs?.['prepare']?.needs).toBe('verify');
    expect(publishWorkflow.jobs?.['tag']).toMatchObject({
      needs: 'prepare',
      permissions: { contents: 'write' },
    });
    expect(publishWorkflow.jobs?.['publish']).toMatchObject({
      environment: 'npm-release',
      needs: ['prepare', 'tag'],
      permissions: { contents: 'read', 'id-token': 'write' },
    });
    expect(publishWorkflow.jobs?.['publish']?.if).toContain(
      "needs.prepare.outputs.should_publish == 'true'",
    );
  });

  test('publishes only the checked tarball without a persistent npm credential', () => {
    expect(publishSource).toContain('pnpm release:checksums verify');
    expect(publishSource).toContain('npm publish');
    expect(publishSource).toContain('$PUBLIC_PACKAGE_ARTIFACT_DIRECTORY/$ARTIFACT_NAME');
    expect(publishSource).not.toContain('NODE_AUTH_TOKEN');
    expect(publishSource).not.toContain('NPM_TOKEN');
    expect(publishSource).not.toContain('--provenance');
  });
});
