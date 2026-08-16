// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import {
  indexImports,
  indexLocalBindingNames,
  indexModuleDeclarations,
  isModuleBindingVisible,
  resolveImportCandidatePaths,
} from './bindings.js';

/** Parses one TypeScript module fixture with parent links. */
const parseSource = (source: string): ts.SourceFile =>
  ts.createSourceFile('/src/agent.ts', source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);

describe('static TypeScript bindings', () => {
  test('indexes configured constructor imports, module clients, exports, and arrays', () => {
    const sourceFile = parseSource(
      [
        "import Client, { Client as NamedClient, type Other } from 'provider';",
        'const client = new NamedClient();',
        'const tools = [firstTool, secondTool];',
        'export const agent = () => client.messages.create({ tools });',
      ].join('\n'),
    );
    const imports = indexImports(sourceFile, {
      namedConstructorImports: ['Client'],
      packageName: 'provider',
      supportsDefaultConstructorImport: true,
    });
    const declarations = indexModuleDeclarations(sourceFile, imports.constructorNames);

    expect(imports.constructorNames).toStrictEqual(new Set(['Client', 'NamedClient']));
    expect(declarations.clientNames).toStrictEqual(new Set(['client']));
    expect(declarations.exports.get('agent')?.kind).toBe('present-supported');
    expect(declarations.moduleArrays.has('tools')).toBe(true);
  });

  test('detects local shadowing of a module-owned client', () => {
    const sourceFile = parseSource(
      [
        "import Client from 'provider';",
        'const client = new Client();',
        'export const agent = (client: unknown) => client;',
      ].join('\n'),
    );
    const identifiers: ts.Identifier[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === 'client') {
        identifiers.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    const usage = identifiers.at(-1);

    if (usage === undefined) {
      throw new TypeError('The binding fixture must contain a client usage.');
    }

    expect(
      isModuleBindingVisible(usage, {
        clientNames: new Set(['client']),
        constructorNames: new Set(['Client']),
        exports: new Map(),
        localBindingNames: indexLocalBindingNames(sourceFile),
        moduleArrays: new Map(),
        moduleConstDeclarations: new Map(),
        namedImports: new Map(),
        path: '/src/agent.ts',
        safeModuleArrayNames: new Set(),
        sourceFile,
        text: {
          locator: {
            locateRange: () => ({
              end: { column: 1, line: 1, offset: 0 },
              start: { column: 1, line: 1, offset: 0 },
            }),
          },
          valid: true,
          value: sourceFile.text,
        },
      }),
    ).toBe(false);
  });

  test.each([
    ['./loader.js', ['/src/loader.ts', '/src/loader.tsx']],
    ['./loader.mjs', ['/src/loader.mts']],
    ['./loader.ts', ['/src/loader.ts']],
    ['./loader', []],
  ])('resolveImportCandidatePaths(%s) -> %o', (specifier, expected) => {
    expect(resolveImportCandidatePaths('/src/agent.ts', specifier)).toStrictEqual(expected);
  });
});
