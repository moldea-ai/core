import ts from 'typescript';

import type { IEveHelperImports } from '../contracts/index.js';

const HELPER_IMPORTS = Object.freeze({
  eve: Object.freeze({ defineAgent: 'defineAgent' }),
  'eve/instructions': Object.freeze({ defineInstructions: 'defineInstructions' }),
  'eve/skills': Object.freeze({ defineSkill: 'defineSkill' }),
  'eve/tools': Object.freeze({ defineTool: 'defineTool' }),
} as const);

/** Indexes exact Eve helper runtime imports by lexical local binding. */
export const indexEveHelperImports = (sourceFile: ts.SourceFile): IEveHelperImports => {
  const defineAgent = new Set<string>();
  const defineInstructions = new Set<string>();
  const defineSkill = new Set<string>();
  const defineTool = new Set<string>();
  const sets = { defineAgent, defineInstructions, defineSkill, defineTool };

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const importClause = statement.importClause;
    const expected = HELPER_IMPORTS[statement.moduleSpecifier.text as keyof typeof HELPER_IMPORTS];

    if (
      expected === undefined ||
      importClause?.isTypeOnly === true ||
      importClause?.namedBindings === undefined ||
      !ts.isNamedImports(importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (!element.isTypeOnly && importedName in expected) {
        sets[importedName as keyof typeof sets].add(element.name.text);
      }
    }
  }

  return Object.freeze({ defineAgent, defineInstructions, defineSkill, defineTool });
};
