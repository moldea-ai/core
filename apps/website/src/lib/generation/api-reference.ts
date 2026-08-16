import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';

import type { IApiEntrypoint, IApiSymbol } from '../model/types.ts';

interface IPackageExports {
  [entrypoint: string]: {
    types?: string;
  };
}

const EXCLUDED_DIRECTORY_NAMES = new Set(['_archive', '_archives', '_backup', '_backups']);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const getSourceEntrypoint = (projectDirectory: string, declarationPath: string): string => {
  const relativeDeclarationPath = declarationPath.replace(/^\.\/dist\//, '');
  const relativeSourcePath = relativeDeclarationPath.replace(/\.d\.ts$/, '.ts');
  const directSourcePath = join(projectDirectory, 'src', relativeSourcePath);

  if (existsSync(directSourcePath)) {
    return directSourcePath;
  }

  const indexSourcePath = join(
    projectDirectory,
    'src',
    relativeSourcePath.replace(/\.ts$/, ''),
    'index.ts',
  );

  if (existsSync(indexSourcePath)) {
    return indexSourcePath;
  }

  throw new Error(`Cannot resolve public declaration ${declarationPath} to a source entry point.`);
};

const getWorkspaceSourcePaths = (projectDirectory: string): Record<string, string[]> => {
  const repositoryRoot = resolve(projectDirectory, '../..');
  const projectsDirectory = join(repositoryRoot, 'projects');
  const sourcePaths: Record<string, string[]> = {};
  const projectEntries = readdirSync(projectsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !EXCLUDED_DIRECTORY_NAMES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of projectEntries) {
    const workspaceProjectDirectory = join(projectsDirectory, entry.name);
    const manifestPath = join(workspaceProjectDirectory, 'package.json');

    if (!existsSync(manifestPath)) continue;

    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));

    if (!isRecord(manifest) || typeof manifest.name !== 'string' || !isRecord(manifest.exports)) {
      continue;
    }

    for (const [subpath, conditions] of Object.entries(manifest.exports)) {
      if (!isRecord(conditions) || typeof conditions.types !== 'string') continue;

      const moduleName = subpath === '.' ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
      sourcePaths[moduleName] = [getSourceEntrypoint(workspaceProjectDirectory, conditions.types)];
    }
  }

  return sourcePaths;
};

const encodeAnchorSegment = (value: string): string => {
  return [...value]
    .map((character) => {
      if (/^[A-Za-z0-9]$/u.test(character)) return character;

      const codePoint = character.codePointAt(0);

      if (codePoint === undefined) throw new Error('Cannot encode an empty API anchor character.');

      return `-${codePoint.toString(16)}-`;
    })
    .join('');
};

const encodeEntrypointAnchorSegment = (entrypoint: string): string => {
  return entrypoint === '.'
    ? 'root'
    : `subpath-${encodeAnchorSegment(entrypoint.replace(/^\.\//u, ''))}`;
};

/** Creates one stable API entry-point fragment identifier. */
export const createApiEntrypointAnchorId = (entrypoint: string): string => {
  return `entrypoint-${encodeEntrypointAnchorSegment(entrypoint)}`;
};

/** Creates one stable entry-point-qualified API symbol fragment identifier. */
export const createApiSymbolAnchorId = (entrypoint: string, symbolName: string): string => {
  return `api-${encodeEntrypointAnchorSegment(entrypoint)}-${encodeAnchorSegment(symbolName)}`;
};

/** Classifies one supported public declaration or fails before publishing an incomplete reference. */
export const getApiDeclarationKind = (declaration: ts.Declaration, symbolName: string): string => {
  if (ts.isInterfaceDeclaration(declaration)) return 'interface';
  if (ts.isTypeAliasDeclaration(declaration)) return 'type';
  if (ts.isClassDeclaration(declaration)) return 'class';
  if (ts.isFunctionDeclaration(declaration)) return 'function';
  if (ts.isEnumDeclaration(declaration)) return 'enum';
  if (ts.isVariableDeclaration(declaration)) return 'value';

  throw new Error(
    `Public export ${symbolName} uses unsupported declaration kind ${ts.SyntaxKind[declaration.kind]}.`,
  );
};

const isPrivateClassElement = (member: ts.ClassElement): boolean => {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;

  if (modifiers?.some(({ kind }) => kind === ts.SyntaxKind.PrivateKeyword)) return true;

  return (
    (ts.isPropertyDeclaration(member) ||
      ts.isMethodDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)) &&
    ts.isPrivateIdentifier(member.name)
  );
};

const createDeclarationClassElement = (
  member: ts.ClassElement,
  className: string,
): ts.ClassElement | null => {
  if (isPrivateClassElement(member) || ts.isClassStaticBlockDeclaration(member)) return null;

  if (ts.isPropertyDeclaration(member)) {
    return ts.factory.updatePropertyDeclaration(
      member,
      member.modifiers,
      member.name,
      member.questionToken ?? member.exclamationToken,
      member.type,
      undefined,
    );
  }

  if (ts.isMethodDeclaration(member)) {
    return ts.factory.updateMethodDeclaration(
      member,
      member.modifiers,
      member.asteriskToken,
      member.name,
      member.questionToken,
      member.typeParameters,
      member.parameters,
      member.type,
      undefined,
    );
  }

  if (ts.isConstructorDeclaration(member)) {
    return ts.factory.updateConstructorDeclaration(
      member,
      member.modifiers,
      member.parameters,
      undefined,
    );
  }

  if (ts.isGetAccessorDeclaration(member)) {
    return ts.factory.updateGetAccessorDeclaration(
      member,
      member.modifiers,
      member.name,
      member.parameters,
      member.type,
      undefined,
    );
  }

  if (ts.isSetAccessorDeclaration(member)) {
    return ts.factory.updateSetAccessorDeclaration(
      member,
      member.modifiers,
      member.name,
      member.parameters,
      undefined,
    );
  }

  if (ts.isIndexSignatureDeclaration(member) || ts.isSemicolonClassElement(member)) return member;

  throw new Error(
    `Public class ${className} uses unsupported member kind ${ts.SyntaxKind[member.kind]}.`,
  );
};

const printDeclaration = (declaration: ts.Declaration): string => {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: true,
  });

  return printer
    .printNode(ts.EmitHint.Unspecified, declaration, declaration.getSourceFile())
    .trim();
};

const getClassSignature = (declaration: ts.ClassDeclaration, symbolName: string): string => {
  const members = declaration.members.flatMap((member): ts.ClassElement[] => {
    const declarationMember = createDeclarationClassElement(member, symbolName);

    return declarationMember ? [declarationMember] : [];
  });
  const declarationOnlyClass = ts.factory.updateClassDeclaration(
    declaration,
    declaration.modifiers,
    declaration.name,
    declaration.typeParameters,
    declaration.heritageClauses,
    members,
  );

  return printDeclaration(declarationOnlyClass);
};

const getSymbolSignature = (
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  declaration: ts.Declaration,
): string => {
  if (
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isEnumDeclaration(declaration)
  ) {
    return printDeclaration(declaration);
  }

  if (ts.isClassDeclaration(declaration)) return getClassSignature(declaration, symbol.getName());

  const symbolType = checker.getTypeOfSymbolAtLocation(symbol, declaration);

  return `${symbol.getName()}: ${checker.typeToString(symbolType, declaration, ts.TypeFormatFlags.NoTruncation)}`;
};

const getEntrypointSymbols = (
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  projectSourceDirectory: string,
): IApiSymbol[] => {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

  if (!moduleSymbol) {
    throw new Error(`Cannot inspect public exports for ${sourceFile.fileName}.`);
  }

  return checker
    .getExportsOfModule(moduleSymbol)
    .map((exportedSymbol): IApiSymbol => {
      const symbol =
        exportedSymbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exportedSymbol)
          : exportedSymbol;
      const declaration = symbol.declarations?.find((candidate) => {
        const declarationPath = resolve(candidate.getSourceFile().fileName);

        return declarationPath.startsWith(`${projectSourceDirectory}/`);
      });

      if (!declaration) {
        throw new Error(
          `Public export ${exportedSymbol.getName()} from ${sourceFile.fileName} has no project-owned declaration.`,
        );
      }

      return {
        description: ts.displayPartsToString(symbol.getDocumentationComment(checker)),
        kind: getApiDeclarationKind(declaration, exportedSymbol.getName()),
        name: exportedSymbol.getName(),
        signature: getSymbolSignature(checker, symbol, declaration),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

/**
 * Generates API entry-point models from the package's actual public TypeScript exports.
 * @param projectDirectory Absolute first-class project directory.
 * @param packageExports Manifest exports object.
 * @returns Deterministically ordered public API entry points.
 */
export const generateApiReference = (
  projectDirectory: string,
  packageExports: IPackageExports,
): IApiEntrypoint[] => {
  const sourceEntrypoints = Object.entries(packageExports)
    .map(([name, conditions]) => {
      if (!conditions.types) {
        throw new Error(`Public entry point ${name} has no TypeScript declaration target.`);
      }

      return {
        name,
        sourcePath: getSourceEntrypoint(projectDirectory, conditions.types),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  if (sourceEntrypoints.length === 0) {
    return [];
  }

  const compilerOptions: ts.CompilerOptions = {
    allowJs: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    paths: getWorkspaceSourcePaths(projectDirectory),
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2024,
    types: ['node'],
  };
  const program = ts.createProgram(
    sourceEntrypoints.map(({ sourcePath }) => sourcePath),
    compilerOptions,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    const diagnostic = diagnostics[0];
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

    throw new Error(`Cannot generate API reference: ${message}`);
  }

  const checker = program.getTypeChecker();
  const projectSourceDirectory = resolve(projectDirectory, 'src');

  return sourceEntrypoints.map(({ name, sourcePath }): IApiEntrypoint => {
    const sourceFile = program.getSourceFile(sourcePath);

    if (!sourceFile) {
      throw new Error(`TypeScript did not load public entry point ${sourcePath}.`);
    }

    return {
      name,
      route: 'api',
      symbols: getEntrypointSymbols(checker, sourceFile, projectSourceDirectory),
    };
  });
};
