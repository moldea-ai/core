// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { indexEveHelperImports } from './helper-imports.js';

const parse = (source: string): ts.SourceFile =>
  ts.createSourceFile('/agent.ts', source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);

describe('indexEveHelperImports', () => {
  test('indexes exact named value helpers and aliases', () => {
    const imports = indexEveHelperImports(
      parse(
        "import { defineAgent as agent } from 'eve';\n" +
          "import { defineInstructions } from 'eve/instructions';\n" +
          "import { defineTool as tool } from 'eve/tools';\n" +
          "import { defineSkill } from 'eve/skills';\n",
      ),
    );

    expect([...imports.defineAgent]).toStrictEqual(['agent']);
    expect([...imports.defineInstructions]).toStrictEqual(['defineInstructions']);
    expect([...imports.defineTool]).toStrictEqual(['tool']);
    expect([...imports.defineSkill]).toStrictEqual(['defineSkill']);
  });

  test('rejects type-only, default, namespace, and wrong-subpath imports', () => {
    const imports = indexEveHelperImports(
      parse(
        "import Eve, { type defineAgent } from 'eve';\n" +
          "import * as tools from 'eve/tools';\n" +
          "import { defineSkill } from 'eve/other';\n",
      ),
    );

    expect([...imports.defineAgent]).toStrictEqual([]);
    expect([...imports.defineTool]).toStrictEqual([]);
    expect([...imports.defineSkill]).toStrictEqual([]);
  });
});
