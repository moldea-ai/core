import ts from 'typescript';

import {
  getCallableExportState,
  getConstExport,
  isBoundIdentifier,
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryReference, IToolManifestEntry } from '@moldea.ai/core/format';

import { LANGCHAIN_ADAPTER_ID, LANGCHAIN_TARGET_ID } from '../constants/index.js';
import type {
  ILangChainBindingResult,
  ILangChainFunctionTool,
  ILangChainFunctionToolShape,
  ILangChainInspectedAgent,
  ILangChainInspectionSession,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';
import {
  classifyLangChainDirectBinding,
  getInlineLangChainFunctionTool,
  getLangChainFunctionTool,
  resolveLangChainStaticString,
} from '../source-analysis/index.js';
import {
  addLangChainDiagnostic,
  addLangChainSourceFailureDiagnostic,
  analyzeLangChainBoundReference,
  compareLangChainStrings,
  createLangChainEvidence,
  isLangChainMachineString,
  locateLangChainNode,
} from './common.js';
import { isClosedLangChainArray, resolveLangChainArray } from './resolution.js';

interface ILangChainToolRelationships {
  readonly implementation: ILangChainBindingResult | null;
  readonly inputSchema: ILangChainBindingResult | null;
}

/** Resolves the static metadata required for one supported normal function-tool shape. */
const resolveFunctionToolMetadata = async (
  session: ILangChainInspectionSession,
  analysis: ILangChainSourceAnalysis,
  functionTool: ILangChainFunctionToolShape,
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
  capabilityId: string,
): Promise<{ readonly runtimeName: string | null } | null> => {
  const onSourceFailure = (failure: Parameters<typeof addLangChainSourceFailureDiagnostic>[1]) =>
    addLangChainSourceFailureDiagnostic(diagnostics, failure, agentId, capabilityId);
  const name = await resolveLangChainStaticString(
    session,
    analysis,
    functionTool.name.expression,
    onSourceFailure,
  );

  if (name.kind !== 'supported' || functionTool.description.kind === 'unresolved') {
    return null;
  }

  if (functionTool.description.kind === 'present') {
    const description = await resolveLangChainStaticString(
      session,
      analysis,
      functionTool.description.expression,
      onSourceFailure,
    );

    if (description.kind !== 'supported') {
      return null;
    }
  }

  return Object.freeze({
    runtimeName: functionTool.name.kind === 'present' ? name.value : null,
  });
};

/** Finds the direct array containing one registration use through transparent wrappers. */
const getContainingArrayLiteral = (identifier: ts.Identifier): ts.ArrayLiteralExpression | null => {
  let expression: ts.Node = identifier;

  while (
    ts.isAsExpression(expression.parent) ||
    ts.isParenthesizedExpression(expression.parent) ||
    ts.isSatisfiesExpression(expression.parent)
  ) {
    expression = expression.parent;
  }

  return ts.isArrayLiteralExpression(expression.parent) ? expression.parent : null;
};

/** Groups direct array-element uses of one bound registration by their containing arrays. */
const collectRegistrationArrayReferences = (
  analysis: ILangChainSourceAnalysis,
  reference: IRepositoryReference & { readonly symbol: string },
): ReadonlyMap<ts.ArrayLiteralExpression, readonly ts.Identifier[]> => {
  const references = new Map<ts.ArrayLiteralExpression, ts.Identifier[]>();

  for (const identifier of analysis.identifierUses.get(reference.symbol) ?? []) {
    if (
      !isModuleBindingVisible(identifier, analysis) ||
      !isBoundIdentifier(identifier, analysis, reference)
    ) {
      continue;
    }

    const array = getContainingArrayLiteral(identifier);

    if (array !== null) {
      const arrayReferences = references.get(array) ?? [];
      arrayReferences.push(identifier);
      references.set(array, arrayReferences);
    }
  }

  return references;
};

/** Checks whether one agent relationship can resolve to a candidate registration array. */
const canResolveToRegistrationArray = (
  inspected: ILangChainInspectedAgent,
  registrationAnalysis: ILangChainSourceAnalysis,
  arrays: ReadonlyMap<ts.ArrayLiteralExpression, readonly ts.Identifier[]>,
): boolean => {
  if (inspected.definition.configuredTools.kind !== 'present') {
    return false;
  }

  const relationship = unwrapExpression(inspected.definition.configuredTools.expression);

  if (ts.isArrayLiteralExpression(relationship)) {
    return inspected.analysis === registrationAnalysis && arrays.has(relationship);
  }

  if (!ts.isIdentifier(relationship) || !isModuleBindingVisible(relationship, inspected.analysis)) {
    return false;
  }

  const localDeclaration = inspected.analysis.moduleConstDeclarations.get(relationship.text);
  const localInitializer =
    localDeclaration?.initializer === undefined
      ? null
      : unwrapExpression(localDeclaration.initializer);

  if (
    inspected.analysis === registrationAnalysis &&
    localInitializer !== null &&
    ts.isArrayLiteralExpression(localInitializer) &&
    arrays.has(localInitializer)
  ) {
    return true;
  }

  return resolveBindingReferences(relationship, inspected.analysis).some((reference) => {
    if (reference.path !== registrationAnalysis.path) {
      return false;
    }

    const declaration = registrationAnalysis.moduleConstDeclarations.get(reference.symbol);
    const initializer =
      declaration?.initializer === undefined ? null : unwrapExpression(declaration.initializer);
    return (
      initializer !== null && ts.isArrayLiteralExpression(initializer) && arrays.has(initializer)
    );
  });
};

/** Collects exact registration uses from closed tool collections owned by supported agents. */
const collectAllowedRegistrationReferences = async (
  session: ILangChainInspectionSession,
  inspectedAgents: readonly ILangChainInspectedAgent[],
  analysis: ILangChainSourceAnalysis,
  reference: IRepositoryReference & { readonly symbol: string },
): Promise<ReadonlySet<ts.Identifier>> => {
  const registrationArrays = collectRegistrationArrayReferences(analysis, reference);
  const references = new Set<ts.Identifier>();

  if (registrationArrays.size === 0) {
    return references;
  }

  for (const inspected of inspectedAgents) {
    session.signal?.throwIfAborted();

    if (!canResolveToRegistrationArray(inspected, analysis, registrationArrays)) {
      continue;
    }

    const relatedRelationships = inspectedAgents
      .filter(({ analysis: candidateAnalysis }) => candidateAnalysis === inspected.analysis)
      .map(({ definition }) => definition.configuredTools);
    const resolved = await resolveLangChainArray(
      session,
      inspected.analysis,
      inspected.definition.configuredTools,
      relatedRelationships,
    );

    if (
      resolved.kind !== 'resolved' ||
      resolved.value.analysis !== analysis ||
      !isClosedLangChainArray(resolved.value.expression)
    ) {
      continue;
    }

    for (const candidate of registrationArrays.get(resolved.value.expression) ?? []) {
      references.add(candidate);
    }
  }

  return references;
};

const inspectImplementation = async (
  session: ILangChainInspectionSession,
  inspected: ILangChainInspectedAgent,
  capabilityId: string,
  manifestTool: IToolManifestEntry,
  registrationAnalysis: ILangChainSourceAnalysis,
  functionTool: ILangChainFunctionTool,
  diagnostics: IAdapterDiagnostic[],
): Promise<ILangChainBindingResult | null> => {
  const reference = manifestTool.implementation;

  if (reference.symbol === undefined) {
    return null;
  }

  const boundReference = Object.freeze({ path: reference.path, symbol: reference.symbol });

  const implementationAnalysis = await analyzeLangChainBoundReference(
    session,
    reference,
    diagnostics,
    inspected.agent.id,
    capabilityId,
  );

  if (implementationAnalysis === null) {
    return null;
  }

  const implementation = getCallableExportState(implementationAnalysis, reference.symbol);

  if (implementation.kind === 'absent') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
      reference.path,
      inspected.agent.id,
      null,
      capabilityId,
    );
    return null;
  }

  if (implementation.kind !== 'present-supported') {
    return null;
  }

  if (functionTool.implementation.kind === 'unresolved') {
    return { kind: 'unresolved' };
  }

  const result = classifyLangChainDirectBinding(
    functionTool.implementation.expression,
    registrationAnalysis,
    boundReference,
  );

  if (result.kind === 'different') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_TOOL_IMPLEMENTATION_NOT_WIRED',
      registrationAnalysis.path,
      inspected.agent.id,
      result.expression === null
        ? locateLangChainNode(registrationAnalysis, functionTool.fields)
        : locateLangChainNode(registrationAnalysis, result.expression),
      capabilityId,
    );
  }

  return result;
};

const inspectInputSchema = async (
  session: ILangChainInspectionSession,
  inspected: ILangChainInspectedAgent,
  capabilityId: string,
  manifestTool: IToolManifestEntry,
  registrationAnalysis: ILangChainSourceAnalysis,
  functionTool: ILangChainFunctionTool,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<ILangChainBindingResult | null> => {
  const reference = manifestTool.inputSchema;

  if (reference?.symbol === undefined) {
    return null;
  }

  const boundReference = Object.freeze({ path: reference.path, symbol: reference.symbol });

  const schemaAnalysis = await analyzeLangChainBoundReference(
    session,
    reference,
    diagnostics,
    inspected.agent.id,
    capabilityId,
  );

  if (schemaAnalysis === null) {
    return null;
  }

  const schema = getConstExport(schemaAnalysis, reference.symbol);

  if (schema.kind === 'absent') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND',
      reference.path,
      inspected.agent.id,
      null,
      capabilityId,
    );
    return null;
  }

  if (schema.kind !== 'present-supported') {
    return null;
  }

  const result =
    functionTool.schema.kind === 'absent'
      ? ({ expression: null, kind: 'different' } as const)
      : functionTool.schema.kind === 'unresolved'
        ? ({ kind: 'unresolved' } as const)
        : classifyLangChainDirectBinding(
            functionTool.schema.expression,
            registrationAnalysis,
            boundReference,
          );

  if (result.kind === 'wired') {
    evidence.push(
      createLangChainEvidence({
        agentId: inspected.agent.id,
        capabilityId,
        capabilityKind: 'tool',
        details: {
          property: 'schema',
          schemaRole: 'tool-input',
          targetId: LANGCHAIN_TARGET_ID,
        },
        kind: 'schema',
        references: [manifestTool.registration as IRepositoryReference, boundReference],
        runtimeName: boundReference.symbol,
        source: LANGCHAIN_ADAPTER_ID,
      }),
    );
  } else if (result.kind === 'different') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_TOOL_INPUT_SCHEMA_NOT_WIRED',
      registrationAnalysis.path,
      inspected.agent.id,
      result.expression === null
        ? locateLangChainNode(registrationAnalysis, functionTool.fields)
        : locateLangChainNode(registrationAnalysis, result.expression),
      capabilityId,
    );
  }

  return result;
};

const classifyRegistration = async (
  session: ILangChainInspectionSession,
  inspectedAgents: readonly ILangChainInspectedAgent[],
  inspected: ILangChainInspectedAgent,
  registrationReference: IRepositoryReference & { readonly symbol: string },
  diagnostics: IAdapterDiagnostic[],
  capabilityId: string,
): Promise<boolean | null> => {
  const relationship = inspected.definition.tools;

  if (relationship.kind === 'absent') {
    return false;
  }

  if (relationship.kind === 'unresolved') {
    return null;
  }

  const relatedRelationships = inspectedAgents
    .filter(({ analysis }) => analysis === inspected.analysis)
    .map(({ definition }) => definition.tools);
  const resolved = await resolveLangChainArray(
    session,
    inspected.analysis,
    relationship,
    relatedRelationships,
  );

  if (resolved.kind === 'source-failure') {
    addLangChainSourceFailureDiagnostic(
      diagnostics,
      resolved.failure,
      inspected.agent.id,
      capabilityId,
    );
    return null;
  }

  if (resolved.kind === 'unresolved' || !isClosedLangChainArray(resolved.value.expression)) {
    return null;
  }

  const resolvedArray = resolved.value;

  const knownRegistrationReferences = Object.values(inspected.agent.declaration.tools ?? {})
    .map(({ registration }) => registration)
    .filter(
      (reference): reference is IRepositoryReference & { readonly symbol: string } =>
        reference?.symbol !== undefined,
    );
  let hasUnresolvedElement = false;

  for (const element of resolvedArray.expression.elements) {
    const candidate = unwrapExpression(element);

    if (ts.isIdentifier(candidate) && isModuleBindingVisible(candidate, resolvedArray.analysis)) {
      if (isBoundIdentifier(candidate, resolvedArray.analysis, registrationReference)) {
        return true;
      }

      const references = resolveBindingReferences(candidate, resolvedArray.analysis);

      if (
        references.some((reference) =>
          knownRegistrationReferences.some(
            (known) => known.path === reference.path && known.symbol === reference.symbol,
          ),
        )
      ) {
        continue;
      }

      const localTool = getLangChainFunctionTool(
        resolvedArray.analysis,
        candidate.text,
        new Set([candidate]),
      );

      if (localTool.kind === 'present-supported') {
        const metadata = await resolveFunctionToolMetadata(
          session,
          resolvedArray.analysis,
          localTool.tool,
          diagnostics,
          inspected.agent.id,
          capabilityId,
        );

        if (metadata !== null && metadata.runtimeName !== null) {
          continue;
        }
      }

      hasUnresolvedElement = true;
      continue;
    }

    const inlineTool = getInlineLangChainFunctionTool(candidate, resolvedArray.analysis);

    if (inlineTool !== null) {
      const metadata = await resolveFunctionToolMetadata(
        session,
        resolvedArray.analysis,
        inlineTool,
        diagnostics,
        inspected.agent.id,
        capabilityId,
      );

      if (metadata !== null && metadata.runtimeName !== null) {
        continue;
      }
    }

    hasUnresolvedElement = true;
  }

  return hasUnresolvedElement ? null : false;
};

const createRegistrationReferences = (
  inspected: ILangChainInspectedAgent,
  registrationReference: IRepositoryReference & { readonly symbol: string },
  manifestTool: IToolManifestEntry,
  relationships: ILangChainToolRelationships,
): readonly IRepositoryReference[] => [
  inspected.agent.declaration.bindings?.runtimeAgent as IRepositoryReference,
  registrationReference,
  ...(relationships.implementation?.kind === 'wired' ? [manifestTool.implementation] : []),
  ...(relationships.inputSchema?.kind === 'wired' && manifestTool.inputSchema !== undefined
    ? [manifestTool.inputSchema]
    : []),
];

/** Inspects all declared normal function tools and their agent registrations. */
export const inspectLangChainTools = async (
  session: ILangChainInspectionSession,
  inspectedAgents: readonly ILangChainInspectedAgent[],
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  for (const inspected of inspectedAgents) {
    const tools = Object.entries(inspected.agent.declaration.tools ?? {}).sort(([left], [right]) =>
      compareLangChainStrings(left, right),
    );

    for (const [capabilityId, manifestTool] of tools) {
      session.signal?.throwIfAborted();
      const registrationReference = manifestTool.registration;

      if (registrationReference?.symbol === undefined) {
        continue;
      }

      const boundRegistrationReference = Object.freeze({
        path: registrationReference.path,
        symbol: registrationReference.symbol,
      });

      const registrationAnalysis = await analyzeLangChainBoundReference(
        session,
        registrationReference,
        diagnostics,
        inspected.agent.id,
        capabilityId,
      );

      if (registrationAnalysis === null) {
        continue;
      }

      const functionTool = getLangChainFunctionTool(
        registrationAnalysis,
        registrationReference.symbol,
        await collectAllowedRegistrationReferences(
          session,
          inspectedAgents,
          registrationAnalysis,
          boundRegistrationReference,
        ),
      );

      if (functionTool.kind === 'absent') {
        addLangChainDiagnostic(
          diagnostics,
          'LANGCHAIN_TOOL_REGISTRATION_SYMBOL_NOT_FOUND',
          registrationReference.path,
          inspected.agent.id,
          null,
          capabilityId,
        );
        continue;
      }

      if (functionTool.kind !== 'present-supported') {
        continue;
      }

      const metadata = await resolveFunctionToolMetadata(
        session,
        registrationAnalysis,
        functionTool.tool,
        diagnostics,
        inspected.agent.id,
        capabilityId,
      );

      if (metadata === null) {
        continue;
      }

      const implementation = await inspectImplementation(
        session,
        inspected,
        capabilityId,
        manifestTool,
        registrationAnalysis,
        functionTool.tool,
        diagnostics,
      );
      const inputSchema = await inspectInputSchema(
        session,
        inspected,
        capabilityId,
        manifestTool,
        registrationAnalysis,
        functionTool.tool,
        evidence,
        diagnostics,
      );
      const runtimeName =
        metadata.runtimeName !== null && isLangChainMachineString(metadata.runtimeName)
          ? metadata.runtimeName
          : null;

      if (inspected.middlewareState !== 'inactive' || runtimeName === null) {
        continue;
      }

      const registration = await classifyRegistration(
        session,
        inspectedAgents,
        inspected,
        boundRegistrationReference,
        diagnostics,
        capabilityId,
      );

      if (registration === true && runtimeName !== manifestTool.name) {
        addLangChainDiagnostic(
          diagnostics,
          'LANGCHAIN_TOOL_NAME_MISMATCH',
          registrationAnalysis.path,
          inspected.agent.id,
          locateLangChainNode(registrationAnalysis, functionTool.tool.name.expression),
          capabilityId,
        );
      } else if (registration === false) {
        addLangChainDiagnostic(
          diagnostics,
          'LANGCHAIN_TOOL_REGISTRATION_NOT_WIRED',
          inspected.analysis.path,
          inspected.agent.id,
          inspected.definition.tools.kind === 'present'
            ? locateLangChainNode(inspected.analysis, inspected.definition.tools.expression)
            : locateLangChainNode(inspected.analysis, inspected.definition.object),
          capabilityId,
        );
      } else if (registration === true) {
        evidence.push(
          createLangChainEvidence({
            agentId: inspected.agent.id,
            capabilityId,
            capabilityKind: 'tool',
            details: {
              helperSource: functionTool.tool.helperSource,
              registrationForm: 'normal-function-tool',
              targetId: LANGCHAIN_TARGET_ID,
            },
            kind: 'tool-registration',
            references: createRegistrationReferences(
              inspected,
              boundRegistrationReference,
              manifestTool,
              { implementation, inputSchema },
            ),
            runtimeName,
            source: LANGCHAIN_ADAPTER_ID,
          }),
        );
      }
    }
  }
};
