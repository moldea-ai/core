// @vitest-environment node
import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';

// workflow fields inspected as durable release-security contracts
interface IWorkflowJob {
  environment?: string;
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, unknown>;
  permissions?: Record<string, string>;
  uses?: string;
  with?: Record<string, unknown>;
}

interface IWorkflow {
  concurrency?: {
    'cancel-in-progress'?: boolean;
    group?: string;
    queue?: string;
  };
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
const publishPackageSource = readFileSync(
  new URL('.github/workflows/publish-package.yml', repositoryRoot),
  'utf8',
);
const ciWorkflow = parse(ciSource) as IWorkflow;
const publishWorkflow = parse(publishSource) as IWorkflow;
const publishPackageWorkflow = parse(publishPackageSource) as IWorkflow;

describe('npm release workflow', () => {
  test('reuses the complete CI boundary with release caching disabled', () => {
    expect(ciWorkflow.on).toHaveProperty('workflow_call');
    expect(ciSource).toContain('release_build:');
    expect(ciSource).toContain('name: Check Changed Package Versions');
    expect(ciSource).toContain('pnpm release:check-changes');
    expect(ciSource).toContain('name: public-package-tarballs');
    expect(ciSource).toContain('SHA256SUMS');
    expect(ciSource.match(/name: public-package-tarballs/gu)).toHaveLength(3);
    expect(publishWorkflow.jobs?.['verify']).toMatchObject({
      needs: 'plan',
      permissions: { contents: 'read' },
      uses: './.github/workflows/ci.yml',
      with: {
        release_build: true,
        release_project: '${{ needs.plan.outputs.project_key }}',
      },
    });
  });

  test('plans automatic main releases while retaining manual bootstrap and recovery', () => {
    expect(publishWorkflow.on).toStrictEqual({
      push: { branches: ['main'] },
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
            description: 'Public package project to bootstrap or recover.',
            options: ['repository', 'repository-fs', 'core', 'cli'],
            required: true,
            type: 'choice',
          },
        },
      },
    });
    expect(publishWorkflow.jobs?.['plan']).toMatchObject({
      outputs: {
        cli_previous_version: '${{ steps.release.outputs.cli_previous_version }}',
        core_previous_version: '${{ steps.release.outputs.core_previous_version }}',
        repository_previous_version: '${{ steps.release.outputs.repository_previous_version }}',
        repository_fs_previous_version:
          '${{ steps.release.outputs.repository_fs_previous_version }}',
      },
      permissions: { contents: 'read' },
    });
    expect(publishSource).toContain('fetch-depth: 0');
    expect(publishSource).toContain('pnpm release:plan');
    expect(publishWorkflow.concurrency).toStrictEqual({
      'cancel-in-progress': false,
      group: 'npm-release',
      queue: 'max',
    });
    expect(publishWorkflow.permissions).toStrictEqual({});
  });

  test('releases selected packages serially in dependency order', () => {
    expect(publishWorkflow.jobs?.['release_repository']).toMatchObject({
      needs: ['plan', 'verify'],
      permissions: { contents: 'write', 'id-token': 'write' },
      uses: './.github/workflows/publish-package.yml',
      with: {
        mode: '${{ needs.plan.outputs.mode }}',
        previous_version: '${{ needs.plan.outputs.repository_previous_version }}',
        project: 'repository',
      },
    });
    expect(publishWorkflow.jobs?.['release_repository_fs']?.needs).toStrictEqual([
      'plan',
      'verify',
      'release_repository',
    ]);
    expect(publishWorkflow.jobs?.['release_core']?.needs).toStrictEqual([
      'plan',
      'verify',
      'release_repository',
      'release_repository_fs',
    ]);
    expect(publishWorkflow.jobs?.['release_cli']?.needs).toStrictEqual([
      'plan',
      'verify',
      'release_repository',
      'release_repository_fs',
      'release_core',
    ]);
    expect(publishWorkflow.jobs?.['release_repository_fs']?.with?.['previous_version']).toBe(
      '${{ needs.plan.outputs.repository_fs_previous_version }}',
    );
    expect(publishWorkflow.jobs?.['release_core']?.with?.['previous_version']).toBe(
      '${{ needs.plan.outputs.core_previous_version }}',
    );
    expect(publishWorkflow.jobs?.['release_cli']?.with?.['previous_version']).toBe(
      '${{ needs.plan.outputs.cli_previous_version }}',
    );
    expect(publishWorkflow.jobs?.['release_repository_fs']?.if).toContain(
      "needs.release_repository.result == 'success'",
    );
    expect(publishWorkflow.jobs?.['release_core']?.if).toContain(
      "needs.release_repository_fs.result == 'success'",
    );
    expect(publishWorkflow.jobs?.['release_cli']?.if).toContain(
      "needs.release_core.result == 'success'",
    );
  });

  test('gates tagging and publishing within the reusable package boundary', () => {
    expect(publishPackageWorkflow.on).toStrictEqual({
      workflow_call: {
        inputs: {
          mode: {
            description: 'Validated bootstrap or trusted release mode.',
            required: true,
            type: 'string',
          },
          previous_version: {
            description:
              'Previous main version for automatic release sequencing; empty for manual releases.',
            required: true,
            type: 'string',
          },
          project: {
            description: 'Validated public package project to release.',
            required: true,
            type: 'string',
          },
        },
      },
    });
    expect(publishPackageWorkflow.jobs?.['tag']).toMatchObject({
      needs: 'prepare',
      permissions: { contents: 'write' },
    });
    expect(publishPackageWorkflow.jobs?.['publish']).toMatchObject({
      environment: 'npm-release',
      needs: ['prepare', 'tag'],
      permissions: { contents: 'read', 'id-token': 'write' },
    });
    expect(publishPackageWorkflow.jobs?.['publish']?.if).toContain(
      "needs.prepare.outputs.should_publish == 'true'",
    );
    expect(publishPackageSource).toContain('RELEASE_PREVIOUS_VERSION');
    expect(publishPackageSource).toContain('"$RELEASE_PREVIOUS_VERSION"');
  });

  test('publishes only the checked tarball without a persistent npm credential', () => {
    expect(publishPackageSource).toContain('pnpm release:checksums verify');
    expect(publishPackageSource).toContain('npm publish');
    expect(publishPackageSource).toContain('$PUBLIC_PACKAGE_ARTIFACT_DIRECTORY/$ARTIFACT_NAME');
    expect(`${publishSource}\n${publishPackageSource}`).not.toContain('NODE_AUTH_TOKEN');
    expect(`${publishSource}\n${publishPackageSource}`).not.toContain('NPM_TOKEN');
    expect(`${publishSource}\n${publishPackageSource}`).not.toContain('--provenance');
  });
});
