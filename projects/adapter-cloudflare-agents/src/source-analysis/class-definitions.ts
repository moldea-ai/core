import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import { CLOUDFLARE_AI_CHAT_TARGET_ID, CLOUDFLARE_THINK_TARGET_ID } from '../constants/index.js';
import type {
  ICloudflareAgentsClassDefinitionResult,
  ICloudflareAgentsSourceAnalysis,
  ICloudflareAgentsTargetId,
} from '../contracts/index.js';
import { isCloudflareAgentsClassInitializationSupported } from './class-initialization.js';
import { indexCloudflareAgentsMethods } from './methods.js';

const hasExportModifier = (declaration: ts.ClassDeclaration): boolean =>
  ts.canHaveModifiers(declaration) &&
  (ts
    .getModifiers(declaration)
    ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
    false);

const getTargetId = (
  declaration: ts.ClassDeclaration,
  analysis: ICloudflareAgentsSourceAnalysis,
): ICloudflareAgentsTargetId | null => {
  const heritageClauses = declaration.heritageClauses;

  if (heritageClauses?.length !== 1) {
    return null;
  }

  const clause = heritageClauses[0];

  if (clause === undefined || clause.token !== ts.SyntaxKind.ExtendsKeyword) {
    return null;
  }

  const types = clause.types;

  if (types.length !== 1) {
    return null;
  }

  const baseType = types[0];

  if (baseType === undefined || baseType.typeArguments !== undefined) {
    return null;
  }

  const base = unwrapExpression(baseType.expression);

  if (!ts.isIdentifier(base) || !isModuleBindingVisible(base, analysis)) {
    return null;
  }

  if (analysis.imports.thinkNames.has(base.text)) {
    return CLOUDFLARE_THINK_TARGET_ID;
  }

  return analysis.imports.aiChatAgentNames.has(base.text) ? CLOUDFLARE_AI_CHAT_TARGET_ID : null;
};

/** Classifies one directly exported Cloudflare agent class under the closed class contract. */
export const getCloudflareAgentsClassDefinition = (
  analysis: ICloudflareAgentsSourceAnalysis,
  symbol: string,
): ICloudflareAgentsClassDefinitionResult => {
  const exported = analysis.exports.get(symbol);

  if (exported === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  if (
    !ts.isClassDeclaration(exported.declaration) ||
    exported.declaration.name?.text !== symbol ||
    !hasExportModifier(exported.declaration)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const targetId = getTargetId(exported.declaration, analysis);

  if (targetId === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const methods = indexCloudflareAgentsMethods(exported.declaration);

  if (methods === null || !isCloudflareAgentsClassInitializationSupported(exported.declaration)) {
    return Object.freeze({
      declaration: exported.declaration,
      kind: 'present-unsupported',
      targetId,
    });
  }

  if (
    targetId === CLOUDFLARE_AI_CHAT_TARGET_ID &&
    (methods.get('onChatMessage')?.declaration.parameters.length !== 2 ||
      methods.get('onChatMessage')?.declaration.parameters[0]?.questionToken !== undefined ||
      methods.get('onChatMessage')?.declaration.parameters[1]?.dotDotDotToken !== undefined)
  ) {
    return Object.freeze({
      declaration: exported.declaration,
      kind: 'present-unsupported',
      targetId,
    });
  }

  return Object.freeze({
    definition: Object.freeze({ declaration: exported.declaration, methods, targetId }),
    kind: 'present-supported',
  });
};
