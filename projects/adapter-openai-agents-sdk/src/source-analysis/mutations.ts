import type ts from 'typescript';

import { analyzeModuleValueMutations } from '@moldea.ai/adapter-static-analysis';

import type { IOpenAiAgentsSdkSourceAnalysis } from '../contracts/index.js';

export interface IOpenAiAgentsSdkMutationAnalysis {
  readonly hasUnknownMutation: boolean;
  readonly mutatedMembers: ReadonlySet<string>;
}

/**
 * Classifies module-local mutations and escapes for one returned SDK object.
 * @param analysis The indexed source containing the binding.
 * @param declaration The module-local constant declaration.
 * @param allowedReferences Bare identifier uses proven to be supported registrations or targets.
 * @returns Member-specific mutations and whether an unknown use can affect every relationship.
 */
export const analyzeOpenAiAgentsSdkMutations = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  declaration: ts.VariableDeclaration,
  allowedReferences: ReadonlySet<ts.Identifier>,
): IOpenAiAgentsSdkMutationAnalysis =>
  analyzeModuleValueMutations(analysis, declaration, allowedReferences);
