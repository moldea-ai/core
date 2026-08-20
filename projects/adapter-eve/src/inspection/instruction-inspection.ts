import ts from 'typescript';

import { getStaticString, normalizeText } from '@moldea.ai/adapter-static-analysis';
import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

import { EVE_ADAPTER_ID } from '../constants/index.js';
import type { IEveAgentDefinition, IEveInspectionSession } from '../contracts/index.js';
import { getEveDefinition, getEvePropertyExpression } from '../source-analysis/index.js';
import {
  addEveDiagnostic,
  addEveSourceFailureDiagnostic,
  compareEveStrings,
  createEveEvidence,
} from './common.js';
import { classifyEveBoundCall } from './relationships.js';

const getDirectName = (root: IRepositoryPath, entry: IRepositoryEntry): string => {
  const prefix = root === '/' ? '/' : `${root}/`;
  return entry.path.slice(prefix.length);
};

const isModernMarkdown = (name: string): boolean => /^instructions\.md$/iu.test(name);
const isLegacyMarkdown = (name: string): boolean => /^system\.md$/iu.test(name);
const isModernModule = (name: string): boolean =>
  /^instructions\.(?:cts|mts|cjs|mjs|ts|js)$/u.test(name);
const isLegacyModule = (name: string): boolean => /^system\.(?:cts|mts|cjs|mjs|ts|js)$/u.test(name);

const addInstructionConflicts = (
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
  candidates: readonly IRepositoryEntry[],
): void => {
  const sorted = [...candidates].sort((left, right) => compareEveStrings(left.path, right.path));
  const primary = sorted[0];

  if (primary === undefined) {
    return;
  }

  for (const conflicting of sorted.slice(1)) {
    addEveDiagnostic(
      diagnostics,
      'EVE_INSTRUCTION_ROOT_CONFLICT',
      primary.path,
      agentId,
      null,
      undefined,
      undefined,
      { conflictingPath: conflicting.path },
    );
  }
};

const inspectMarkdown = async (
  session: IEveInspectionSession,
  definition: IEveAgentDefinition,
  path: IRepositoryPath,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const binding = definition.agent.declaration.bindings?.instructionLoader;

  if (binding === undefined) {
    return;
  }

  const bytes = await session.reader.readFile(
    path,
    session.signal === undefined ? undefined : { signal: session.signal },
  );
  const text = normalizeText(bytes);

  if (!text.valid) {
    addEveDiagnostic(diagnostics, 'EVE_SOURCE_TEXT_INVALID', path, definition.agent.id);
    return;
  }

  if (binding.path === path && binding.symbol === undefined) {
    evidence.push(
      createEveEvidence({
        agentId: definition.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {},
        kind: 'instruction-loader',
        references: [binding],
        runtimeName: null,
        source: EVE_ADAPTER_ID,
      }),
    );
    return;
  }

  if (binding.symbol === undefined) {
    addEveDiagnostic(diagnostics, 'EVE_INSTRUCTION_LOADER_NOT_WIRED', path, definition.agent.id);
  }
};

const inspectTypeScriptInstructions = async (
  session: IEveInspectionSession,
  definition: IEveAgentDefinition,
  path: IRepositoryPath,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const binding = definition.agent.declaration.bindings?.instructionLoader;

  if (binding === undefined) {
    return;
  }

  const result = await session.analyzeSource(path);

  if (addEveSourceFailureDiagnostic(diagnostics, result, path, definition.agent.id)) {
    return;
  }

  if (result.kind !== 'valid') {
    return;
  }

  const instructions = getEveDefinition(result.analysis, 'instructions');

  if (
    instructions.kind !== 'present-supported' ||
    instructions.properties.size < 1 ||
    instructions.properties.size > 2 ||
    !instructions.properties.has('content') ||
    [...instructions.properties].some(
      ([key, property]) => !['content', 'role'].includes(key) || !ts.isPropertyAssignment(property),
    )
  ) {
    return;
  }

  const role = getEvePropertyExpression(instructions.properties, 'role');

  if (role !== null && getStaticString(role) !== 'system') {
    if (getStaticString(role) === 'user') {
      addEveDiagnostic(diagnostics, 'EVE_INSTRUCTION_LOADER_NOT_WIRED', path, definition.agent.id);
    }

    return;
  }

  const loaderSource = await session.analyzeSource(binding.path);

  if (addEveSourceFailureDiagnostic(diagnostics, loaderSource, binding.path, definition.agent.id)) {
    return;
  }

  const state = await classifyEveBoundCall(
    session,
    result.analysis,
    getEvePropertyExpression(instructions.properties, 'content'),
    binding,
  );

  if (state === 'missing') {
    addEveDiagnostic(
      diagnostics,
      'EVE_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND',
      binding.path,
      definition.agent.id,
    );
  } else if (state === 'wired') {
    evidence.push(
      createEveEvidence({
        agentId: definition.agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {},
        kind: 'instruction-loader',
        references: [binding],
        runtimeName: binding.symbol ?? null,
        source: EVE_ADAPTER_ID,
      }),
    );
  } else if (state === 'different') {
    addEveDiagnostic(diagnostics, 'EVE_INSTRUCTION_LOADER_NOT_WIRED', path, definition.agent.id);
  }
};

/** Inspects the exclusive modern instruction surface for one supported Eve agent. */
export const inspectEveInstructions = async (
  session: IEveInspectionSession,
  definition: IEveAgentDefinition,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  const entries = definition.rootIndex.instructionEntries;
  const named = entries.map((entry) => ({
    entry,
    name: getDirectName(definition.root.agentRoot, entry),
  }));
  const directory = named.find(
    ({ entry, name }) => entry.type === 'directory' && name === 'instructions',
  );

  if (directory !== undefined) {
    return;
  }

  const modern = named.filter(
    ({ entry, name }) => entry.type === 'file' && (isModernMarkdown(name) || isModernModule(name)),
  );

  if (modern.length > 1) {
    if (!modern.every(({ name }) => isModernMarkdown(name))) {
      addInstructionConflicts(
        diagnostics,
        definition.agent.id,
        modern.map(({ entry }) => entry),
      );
    }

    return;
  }

  if (modern.length === 1) {
    const modernSource = modern[0];

    if (modernSource === undefined) {
      return;
    }

    const { entry, name } = modernSource;

    if (name === 'instructions.md') {
      await inspectMarkdown(session, definition, entry.path, evidence, diagnostics);
    } else if (name === 'instructions.ts') {
      await inspectTypeScriptInstructions(session, definition, entry.path, evidence, diagnostics);
    }

    return;
  }

  const legacy = named.filter(
    ({ entry, name }) => entry.type === 'file' && (isLegacyMarkdown(name) || isLegacyModule(name)),
  );

  if (legacy.length > 1 && !legacy.every(({ name }) => isLegacyMarkdown(name))) {
    addInstructionConflicts(
      diagnostics,
      definition.agent.id,
      legacy.map(({ entry }) => entry),
    );
    return;
  }

  if (
    legacy.length === 0 &&
    definition.agent.declaration.bindings?.instructionLoader !== undefined
  ) {
    addEveDiagnostic(
      diagnostics,
      'EVE_INSTRUCTION_LOADER_NOT_WIRED',
      definition.analysis.path,
      definition.agent.id,
    );
  }
};
