// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { analyzeEveSource } from './source-analysis.js';
import { getEveDefinition } from './object-definitions.js';

const analyze = (source: string) => {
  const result = analyzeEveSource('/agent.ts' as never, new TextEncoder().encode(source));

  if (result.kind !== 'valid') {
    throw new TypeError(`Expected a valid source, received ${result.kind}.`);
  }

  return result.analysis;
};

describe('getEveDefinition', () => {
  test('accepts one direct aliased default helper call through transparent wrappers', () => {
    const definition = getEveDefinition(
      analyze(
        "import { defineAgent as agent } from 'eve';\n" +
          "export default (agent({ model: 'provider/model' }) satisfies unknown);\n",
      ),
      'agent',
    );

    expect(definition.kind).toBe('present-supported');
  });

  test.each([
    ["import { defineAgent } from 'eve'; export default { model: 'x' };"],
    [
      "import { defineAgent } from 'eve'; const value = defineAgent({ model: 'x' }); export default value;",
    ],
    ["import { defineAgent } from 'eve'; export default defineAgent({ model: 'x', ...extra });"],
    ["import { defineAgent } from 'eve'; export default defineAgent({ model: 'x', model: 'y' });"],
    [
      "import { defineAgent } from 'eve'; export default defineAgent({ __proto__: {}, model: 'x' });",
    ],
  ])('rejects an unsupported default export %#', (source) => {
    expect(getEveDefinition(analyze(source), 'agent').kind).toBe('present-unsupported');
  });
});
