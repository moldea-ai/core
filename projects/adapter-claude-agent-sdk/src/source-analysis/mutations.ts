import type ts from 'typescript';

import { analyzeModuleValueMutations } from '@moldea.ai/adapter-static-analysis';

import type { IClaudeAgentSdkSourceAnalysis } from '../contracts/index.js';

export interface IClaudeAgentSdkMutationAnalysis {
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
export const analyzeClaudeAgentSdkMutations = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  declaration: ts.VariableDeclaration,
  allowedReferences: ReadonlySet<ts.Identifier>,
): IClaudeAgentSdkMutationAnalysis =>
  analyzeModuleValueMutations(analysis, declaration, allowedReferences);
