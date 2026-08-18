import { posix } from 'node:path';
import ts from 'typescript';

import type {
  IStaticAnalysisExportState,
  IStaticAnalysisImportConfig,
  IStaticAnalysisModuleArray,
  IStaticAnalysisNamedImport,
  IStaticAnalysisReference,
  IStaticAnalysisSource,
} from '../types.js';
import { unwrapExpression } from './expressions.js';

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);

const isConstDeclarationList = (declarationList: ts.VariableDeclarationList): boolean =>
  (declarationList.flags & ts.NodeFlags.Const) !== 0;

/**
 * Indexes static value imports and supported SDK constructor imports.
 * @param sourceFile The parsed TypeScript source.
 * @param config The provider package and constructor import forms.
 * @returns Module-owned import bindings needed by static checks.
 */
export const indexImports = (
  sourceFile: ts.SourceFile,
  config: IStaticAnalysisImportConfig,
): {
  readonly constructorNames: ReadonlySet<string>;
  readonly namedImports: ReadonlyMap<string, IStaticAnalysisNamedImport>;
} => {
  const constructorNames = new Set<string>();
  const namedImports = new Map<string, IStaticAnalysisNamedImport>();
  const supportedNamedImports = new Set(config.namedConstructorImports);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const importClause = statement.importClause;

    if (importClause?.isTypeOnly === true) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier.text;

    if (
      moduleSpecifier === config.packageName &&
      config.supportsDefaultConstructorImport &&
      importClause?.name !== undefined
    ) {
      constructorNames.add(importClause.name.text);
    }

    if (
      moduleSpecifier === config.packageName &&
      importClause?.namedBindings !== undefined &&
      ts.isNamedImports(importClause.namedBindings)
    ) {
      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;

        if (!element.isTypeOnly && supportedNamedImports.has(importedName)) {
          constructorNames.add(element.name.text);
        }
      }
    }

    if (
      !moduleSpecifier.startsWith('.') ||
      importClause?.namedBindings === undefined ||
      !ts.isNamedImports(importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of importClause.namedBindings.elements) {
      if (element.isTypeOnly) {
        continue;
      }

      namedImports.set(
        element.name.text,
        Object.freeze({
          importedName: element.propertyName?.text ?? element.name.text,
          moduleSpecifier,
        }),
      );
    }
  }

  return { constructorNames, namedImports };
};

/**
 * Indexes direct exports, module-level SDK clients, and constant arrays.
 * @param sourceFile The parsed TypeScript source.
 * @param constructorNames The supported constructor bindings.
 * @returns Static module declarations used by adapter inspection.
 */
export const indexModuleDeclarations = (
  sourceFile: ts.SourceFile,
  constructorNames: ReadonlySet<string>,
): {
  readonly clientNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    IStaticAnalysisExportState & { readonly declaration: ts.Node }
  >;
  readonly moduleArrays: ReadonlyMap<string, IStaticAnalysisModuleArray>;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
} => {
  const clientNames = new Set<string>();
  const exports = new Map<string, IStaticAnalysisExportState & { readonly declaration: ts.Node }>();
  const moduleArrays = new Map<string, IStaticAnalysisModuleArray>();
  const moduleConstDeclarations = new Map<string, ts.VariableDeclaration>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        exports.set(
          statement.name.text,
          Object.freeze({
            declaration: statement,
            kind:
              statement.body === undefined || hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
                ? 'present-unsupported'
                : 'present-supported',
          }),
        );
      }

      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
      if (!ts.isNamedExports(statement.exportClause) || statement.isTypeOnly) {
        continue;
      }

      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) {
          exports.set(
            element.name.text,
            Object.freeze({ declaration: element, kind: 'present-unsupported' }),
          );
        }
      }

      continue;
    }

    if (!ts.isVariableStatement(statement)) {
      if (
        hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
        (ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement) ||
          ts.isModuleDeclaration(statement)) &&
        statement.name !== undefined &&
        ts.isIdentifier(statement.name)
      ) {
        exports.set(
          statement.name.text,
          Object.freeze({ declaration: statement, kind: 'present-unsupported' }),
        );
      }

      continue;
    }

    const isConst = isConstDeclarationList(statement.declarationList);
    const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) {
        continue;
      }

      if (isExported) {
        exports.set(
          declaration.name.text,
          Object.freeze({
            declaration,
            kind:
              isConst && declaration.initializer !== undefined
                ? 'present-supported'
                : 'present-unsupported',
          }),
        );
      }

      if (!isConst || declaration.initializer === undefined) {
        continue;
      }

      moduleConstDeclarations.set(declaration.name.text, declaration);
      const initializer = unwrapExpression(declaration.initializer);

      if (ts.isNewExpression(initializer)) {
        const constructor = unwrapExpression(initializer.expression);

        if (ts.isIdentifier(constructor) && constructorNames.has(constructor.text)) {
          clientNames.add(declaration.name.text);
        }
      }

      if (ts.isArrayLiteralExpression(initializer)) {
        moduleArrays.set(
          declaration.name.text,
          Object.freeze({ declaration, expression: initializer }),
        );
      }
    }
  }

  return { clientNames, exports, moduleArrays, moduleConstDeclarations };
};

const addBindingNames = (names: Set<string>, bindingName: ts.BindingName): void => {
  if (ts.isIdentifier(bindingName)) {
    names.add(bindingName.text);
    return;
  }

  for (const element of bindingName.elements) {
    if (!ts.isOmittedExpression(element)) {
      addBindingNames(names, element.name);
    }
  }
};

const addVariableDeclarationListBindings = (
  names: Set<string>,
  declarationList: ts.VariableDeclarationList,
): void => {
  for (const declaration of declarationList.declarations) {
    addBindingNames(names, declaration.name);
  }
};

const addStatementBindings = (names: Set<string>, statement: ts.Statement): void => {
  if (ts.isVariableStatement(statement)) {
    addVariableDeclarationListBindings(names, statement.declarationList);
    return;
  }

  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    if (statement.name !== undefined && ts.isIdentifier(statement.name)) {
      names.add(statement.name.text);
    }
  }
};

const isFunctionScope = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isArrowFunction(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

const getLocalBindingNames = (bindings: Map<ts.Node, Set<string>>, scope: ts.Node): Set<string> => {
  const existingNames = bindings.get(scope);

  if (existingNames !== undefined) {
    return existingNames;
  }

  const names = new Set<string>();
  bindings.set(scope, names);
  return names;
};

/**
 * Indexes local runtime bindings that can shadow module-owned identifiers.
 * @param sourceFile The parsed TypeScript source.
 * @returns Local binding names keyed by lexical or function scope.
 */
export const indexLocalBindingNames = (
  sourceFile: ts.SourceFile,
): ReadonlyMap<ts.Node, ReadonlySet<string>> => {
  const bindings = new Map<ts.Node, Set<string>>();
  const visit = (node: ts.Node, functionScope: ts.FunctionLikeDeclaration | null): void => {
    let childFunctionScope = functionScope;

    if (isFunctionScope(node)) {
      const names = getLocalBindingNames(bindings, node);

      for (const parameter of node.parameters) {
        addBindingNames(names, parameter.name);
      }

      if (node.name !== undefined && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }

      childFunctionScope = node;
    }

    if (ts.isBlock(node) || ts.isModuleBlock(node)) {
      const names = getLocalBindingNames(bindings, node);

      for (const statement of node.statements) {
        addStatementBindings(names, statement);
      }
    } else if (ts.isCaseBlock(node)) {
      const names = getLocalBindingNames(bindings, node);

      for (const clause of node.clauses) {
        for (const statement of clause.statements) {
          addStatementBindings(names, statement);
        }
      }
    } else if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      addBindingNames(getLocalBindingNames(bindings, node), node.variableDeclaration.name);
    } else if (
      (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      node.initializer !== undefined &&
      ts.isVariableDeclarationList(node.initializer)
    ) {
      addVariableDeclarationListBindings(getLocalBindingNames(bindings, node), node.initializer);
    } else if (ts.isClassExpression(node) && node.name !== undefined) {
      getLocalBindingNames(bindings, node).add(node.name.text);
    }

    if (
      childFunctionScope !== null &&
      ts.isVariableDeclarationList(node) &&
      (node.flags & ts.NodeFlags.BlockScoped) === 0
    ) {
      addVariableDeclarationListBindings(getLocalBindingNames(bindings, childFunctionScope), node);
    }

    ts.forEachChild(node, (child) => visit(child, childFunctionScope));
  };

  visit(sourceFile, null);
  return bindings;
};

/**
 * Indexes identifier occurrences once for binding-specific safety analysis.
 * @param sourceFile The parsed TypeScript source.
 * @returns Identifier occurrences grouped by exact source spelling.
 */
export const indexIdentifierUses = (
  sourceFile: ts.SourceFile,
): ReadonlyMap<string, readonly ts.Identifier[]> => {
  const identifierUses = new Map<string, ts.Identifier[]>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const uses = identifierUses.get(node.text) ?? [];
      uses.push(node);
      identifierUses.set(node.text, uses);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return new Map([...identifierUses].map(([name, uses]) => [name, Object.freeze(uses)] as const));
};

/**
 * Determines whether a module-bound name is visible at one identifier use.
 * @param identifier The identifier whose lexical environment is inspected.
 * @param analysis The indexed source containing the identifier.
 * @returns Whether no parameter or local declaration shadows the module binding.
 */
export const isModuleBindingVisible = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
): boolean => {
  let current: ts.Node | undefined = identifier.parent;

  while (current !== undefined && !ts.isSourceFile(current)) {
    if (analysis.localBindingNames.get(current)?.has(identifier.text) === true) {
      return false;
    }

    current = current.parent;
  }

  return true;
};

/**
 * Resolves TypeScript source candidates for a supported relative ESM specifier.
 * @param containingPath The importing source path.
 * @param moduleSpecifier The exact relative ESM specifier.
 * @returns Supported logical source candidates in deterministic order.
 */
export const resolveImportCandidatePaths = (
  containingPath: string,
  moduleSpecifier: string,
): readonly string[] => {
  const resolved = posix.resolve(posix.dirname(containingPath), moduleSpecifier);

  if (resolved.endsWith('.js')) {
    return [`${resolved.slice(0, -3)}.ts`, `${resolved.slice(0, -3)}.tsx`];
  }

  if (resolved.endsWith('.mjs')) {
    return [`${resolved.slice(0, -4)}.mts`];
  }

  return ['.ts', '.tsx', '.mts'].some((extension) => resolved.endsWith(extension))
    ? [resolved]
    : [];
};

/**
 * Resolves the explicit module references an identifier can denote.
 * @param identifier The local source identifier.
 * @param analysis The source containing that identifier.
 * @returns Same-file or relative-import candidates in deterministic order.
 */
export const resolveBindingReferences = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
): readonly (IStaticAnalysisReference & { readonly symbol: string })[] => {
  if (!isModuleBindingVisible(identifier, analysis)) {
    return [];
  }

  const references: (IStaticAnalysisReference & { readonly symbol: string })[] = [];

  if (analysis.exports.has(identifier.text)) {
    references.push(Object.freeze({ path: analysis.path, symbol: identifier.text }));
  }

  const namedImport = analysis.namedImports.get(identifier.text);

  if (namedImport !== undefined) {
    references.push(
      ...resolveImportCandidatePaths(analysis.path, namedImport.moduleSpecifier).map((path) =>
        Object.freeze({ path, symbol: namedImport.importedName }),
      ),
    );
  }

  return references;
};

/**
 * Checks whether an identifier resolves directly to an explicit bound reference.
 * @param identifier The local source identifier.
 * @param analysis The source containing that identifier.
 * @param reference The explicit source binding to match.
 * @returns Whether local or named-import identity proves the relationship.
 */
export const isBoundIdentifier = (
  identifier: ts.Identifier,
  analysis: IStaticAnalysisSource,
  reference: IStaticAnalysisReference,
): boolean => {
  if (reference.symbol === undefined) {
    return false;
  }

  return resolveBindingReferences(identifier, analysis).some(
    (candidate) => candidate.path === reference.path && candidate.symbol === reference.symbol,
  );
};
