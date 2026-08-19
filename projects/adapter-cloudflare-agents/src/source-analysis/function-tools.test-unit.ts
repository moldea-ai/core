// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { analyzeCloudflareAgentsSource, getCloudflareAgentsFunctionTool } from './index.js';

describe('Cloudflare Agents function tools', () => {
  test('accepts the closed AI SDK function-tool shape', () => {
    const result = analyzeCloudflareAgentsSource(
      parseRepositoryPath('/src/tools.ts'),
      new TextEncoder().encode(
        "import { tool } from 'ai'; export const searchTool = tool({ inputSchema: Input, outputSchema: Output, execute });",
      ),
    );

    if (result.kind !== 'valid') {
      throw new TypeError('The tool fixture must be valid.');
    }

    const declaration = result.analysis.moduleConstDeclarations.get('searchTool');

    if (declaration === undefined) {
      throw new TypeError('The tool declaration must be indexed.');
    }

    expect(getCloudflareAgentsFunctionTool(result.analysis, declaration)).toMatchObject({
      execute: { kind: 'present' },
      inputSchema: { kind: 'present' },
      outputSchema: { kind: 'present' },
    });
  });
});
