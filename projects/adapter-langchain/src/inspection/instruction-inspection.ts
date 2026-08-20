import ts from 'typescript';

import {
  getCallableExportState,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import { LANGCHAIN_ADAPTER_ID, LANGCHAIN_TARGET_ID } from '../constants/index.js';
import type {
  ILangChainBindingResult,
  ILangChainInspectedAgent,
  ILangChainInspectionSession,
} from '../contracts/index.js';
import { classifyLangChainLoaderCall } from '../source-analysis/index.js';
import {
  addLangChainDiagnostic,
  analyzeLangChainBoundReference,
  createLangChainEvidence,
  locateLangChainNode,
} from './common.js';

const classifyInstruction = (
  inspected: ILangChainInspectedAgent,
  reference: IRepositoryReference & { readonly symbol: string },
): ILangChainBindingResult & { readonly instructionForm?: string } => {
  const relationship = inspected.definition.systemPrompt;

  if (relationship.kind === 'absent') {
    return Object.freeze({ expression: null, kind: 'different' });
  }

  if (relationship.kind === 'unresolved') {
    return Object.freeze({ kind: 'unresolved' });
  }

  const candidate = unwrapExpression(relationship.expression);

  if (ts.isNewExpression(candidate) && candidate.arguments?.length === 1) {
    const constructor = unwrapExpression(candidate.expression);

    if (
      ts.isIdentifier(constructor) &&
      inspected.analysis.imports.systemMessageNames.has(constructor.text) &&
      isModuleBindingVisible(constructor, inspected.analysis)
    ) {
      const result = classifyLangChainLoaderCall(
        candidate.arguments[0] as ts.Expression,
        inspected.analysis,
        reference,
      );
      return Object.freeze({ ...result, instructionForm: 'system-message' });
    }

    return Object.freeze({ kind: 'unresolved' });
  }

  const result = classifyLangChainLoaderCall(candidate, inspected.analysis, reference);
  return Object.freeze({ ...result, instructionForm: 'direct-loader-call' });
};

/** Inspects one declared instruction loader against the supported system prompt surface. */
export const inspectLangChainInstruction = async (
  session: ILangChainInspectionSession,
  inspected: ILangChainInspectedAgent,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const reference = inspected.agent.declaration.bindings?.instructionLoader;

  if (reference?.symbol === undefined) {
    return;
  }

  const boundReference = Object.freeze({ path: reference.path, symbol: reference.symbol });

  const loaderAnalysis = await analyzeLangChainBoundReference(
    session,
    reference,
    diagnostics,
    inspected.agent.id,
  );

  if (loaderAnalysis === null) {
    return;
  }

  const loader = getCallableExportState(loaderAnalysis, reference.symbol);

  if (loader.kind === 'absent') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      reference.path,
      inspected.agent.id,
    );
    return;
  }

  if (loader.kind !== 'present-supported' || inspected.middlewareState !== 'inactive') {
    return;
  }

  const result = classifyInstruction(inspected, boundReference);

  if (result.kind === 'wired') {
    evidence.push(
      createLangChainEvidence({
        agentId: inspected.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {
          instructionForm: result.instructionForm ?? 'direct-loader-call',
          property: 'systemPrompt',
          targetId: LANGCHAIN_TARGET_ID,
        },
        kind: 'instruction-loader',
        references: [
          inspected.agent.declaration.bindings?.runtimeAgent as IRepositoryReference,
          boundReference,
        ],
        runtimeName: boundReference.symbol,
        source: LANGCHAIN_ADAPTER_ID,
      }),
    );
  } else if (result.kind === 'different') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_INSTRUCTION_LOADER_NOT_WIRED',
      inspected.analysis.path,
      inspected.agent.id,
      result.expression === null
        ? locateLangChainNode(inspected.analysis, inspected.definition.object)
        : locateLangChainNode(inspected.analysis, result.expression),
    );
  }
};
