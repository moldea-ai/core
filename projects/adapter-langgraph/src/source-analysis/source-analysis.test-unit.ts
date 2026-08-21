// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { analyzeLangGraphSource } from './source-analysis.js';

const analyze = (source: string, path = '/src/graph.ts') => {
  const result = analyzeLangGraphSource(
    parseRepositoryPath(path),
    new TextEncoder().encode(source),
  );

  if (result.kind !== 'valid') {
    throw new TypeError(`Expected valid source, received ${result.kind}.`);
  }

  return result.analysis;
};

describe('analyzeLangGraphSource', () => {
  test.each(['/src/graph.ts', '/src/graph.tsx', '/src/graph.mts'])(
    'indexes exact package-root runtime aliases from %s',
    (path) => {
      const analysis = analyze(
        [
          "import { StateGraph as Graph, entrypoint as workflow, type task } from '@langchain/langgraph';",
          "import { interrupt } from '@langchain/langgraph/web';",
          'export const graph = Graph;',
        ].join('\n'),
        path,
      );

      expect(analysis.imports.stateGraphNames).toStrictEqual(new Set(['Graph']));
      expect(analysis.imports.entrypointNames).toStrictEqual(new Set(['workflow']));
      expect(analysis.imports.taskNames).toStrictEqual(new Set());
      expect(analysis.imports.interruptNames).toStrictEqual(new Set());
    },
  );

  test('ignores default, namespace, type-only, and unrelated imports', () => {
    const analysis = analyze(
      [
        "import LangGraph from '@langchain/langgraph';",
        "import * as graph from '@langchain/langgraph';",
        "import type { StateGraph } from '@langchain/langgraph';",
        "import { entrypoint } from 'langgraph';",
      ].join('\n'),
    );

    expect(analysis.imports.stateGraphNames).toStrictEqual(new Set());
    expect(analysis.imports.entrypointNames).toStrictEqual(new Set());
  });

  test('reports invalid portable text and invalid syntax without an analysis', () => {
    expect(
      analyzeLangGraphSource(parseRepositoryPath('/src/graph.ts'), Uint8Array.from([0xff])),
    ).toStrictEqual({ kind: 'invalid-text' });
    expect(
      analyzeLangGraphSource(
        parseRepositoryPath('/src/graph.ts'),
        new TextEncoder().encode('export const graph = (;'),
      ),
    ).toMatchObject({ kind: 'invalid-syntax' });
  });
});
