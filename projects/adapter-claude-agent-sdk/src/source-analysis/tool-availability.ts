import ts from 'typescript';

import { unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  IClaudeAgentSdkAvailability,
  IClaudeAgentSdkRelationship,
  IClaudeAgentSdkSourceAnalysis,
  IClaudeAgentSdkStaticStringResult,
} from '../contracts/index.js';
import { getClaudeAgentSdkClosedArray } from './collections.js';

type IStaticStringResolver = (
  analysis: IClaudeAgentSdkSourceAnalysis,
  expression: ts.Expression,
) => Promise<IClaudeAgentSdkStaticStringResult>;

const hasUnsupportedGlobSyntax = (pattern: string): boolean => /[?[\]{}\\]/u.test(pattern);

const isScopedPermission = (value: string): boolean => /^[^()]+\(.*\)$/u.test(value);

/**
 * Matches a complete runtime tool name against the supported bare `*` glob model.
 * @param pattern The exact compiler-parsed deny pattern.
 * @param runtimeName The complete runtime-visible tool name.
 * @returns Whether the complete name matches.
 */
export const matchesClaudeAgentSdkBarePattern = (pattern: string, runtimeName: string): boolean => {
  const patternScalars = Array.from(pattern);
  const nameScalars = Array.from(runtimeName);
  let patternIndex = 0;
  let nameIndex = 0;
  let wildcardIndex = -1;
  let wildcardNameIndex = -1;

  while (nameIndex < nameScalars.length) {
    if (
      patternIndex < patternScalars.length &&
      patternScalars[patternIndex] !== '*' &&
      patternScalars[patternIndex] === nameScalars[nameIndex]
    ) {
      patternIndex += 1;
      nameIndex += 1;
    } else if (patternScalars[patternIndex] === '*') {
      wildcardIndex = patternIndex;
      wildcardNameIndex = nameIndex;
      patternIndex += 1;
    } else if (wildcardIndex >= 0) {
      patternIndex = wildcardIndex + 1;
      wildcardNameIndex += 1;
      nameIndex = wildcardNameIndex;
    } else {
      return false;
    }
  }

  while (patternScalars[patternIndex] === '*') {
    patternIndex += 1;
  }

  return patternIndex === patternScalars.length;
};

const resolveList = async (
  relationship: IClaudeAgentSdkRelationship,
  analysis: IClaudeAgentSdkSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
  resolveStaticString: IStaticStringResolver,
): Promise<readonly string[] | null> => {
  const elements = getClaudeAgentSdkClosedArray(relationship, analysis, allowedReferences);

  if (elements === null) {
    return null;
  }

  const names: string[] = [];

  for (const element of elements) {
    const result = await resolveStaticString(analysis, element);

    if (result.kind !== 'supported') {
      return null;
    }

    names.push(result.value);
  }

  return Object.freeze(names);
};

const applyDenyList = async (
  current: IClaudeAgentSdkAvailability,
  relationship: IClaudeAgentSdkRelationship,
  analysis: IClaudeAgentSdkSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
  runtimeName: string,
  resolveStaticString: IStaticStringResolver,
  legacyRuntimeName?: string,
  serverSelector?: string,
): Promise<IClaudeAgentSdkAvailability> => {
  if (relationship.kind === 'absent') {
    return current;
  }

  const entries = await resolveList(relationship, analysis, allowedReferences, resolveStaticString);

  if (entries === null) {
    return current === 'unavailable' ? current : 'unresolved';
  }

  let hasUnresolvedEntry = false;

  for (const entry of entries) {
    if (serverSelector !== undefined && entry === serverSelector) {
      return 'unavailable';
    }

    if (!hasUnsupportedGlobSyntax(entry) && !isScopedPermission(entry)) {
      if (matchesClaudeAgentSdkBarePattern(entry, runtimeName)) {
        return 'unavailable';
      }

      if (
        legacyRuntimeName !== undefined &&
        matchesClaudeAgentSdkBarePattern(entry, legacyRuntimeName)
      ) {
        hasUnresolvedEntry = true;
      }

      continue;
    }

    if (
      entry.startsWith(runtimeName) ||
      (legacyRuntimeName !== undefined && entry.startsWith(legacyRuntimeName)) ||
      entry.includes('*')
    ) {
      hasUnresolvedEntry = true;
    }
  }

  return current === 'unavailable' ? current : hasUnresolvedEntry ? 'unresolved' : current;
};

/**
 * Derives query-configured availability of the built-in Agent delegation tool.
 * @param analysis The query source analysis.
 * @param tools The query-level tools relationship.
 * @param disallowedTools The query-level deny relationship.
 * @param agentSelection The unsupported main-thread selection relationship.
 * @param toolAliases The unsupported tool-alias relationship.
 * @param allowedReferences Supported references to shared list constants.
 * @param resolveStaticString The operation-local exact string resolver.
 * @returns The relationship-local availability state.
 */
export const classifyClaudeAgentSdkAgentAvailability = async (
  analysis: IClaudeAgentSdkSourceAnalysis,
  tools: IClaudeAgentSdkRelationship,
  disallowedTools: IClaudeAgentSdkRelationship,
  agentSelection: IClaudeAgentSdkRelationship,
  toolAliases: IClaudeAgentSdkRelationship,
  allowedReferences: ReadonlySet<ts.Identifier>,
  resolveStaticString: IStaticStringResolver,
): Promise<IClaudeAgentSdkAvailability> => {
  let availability: IClaudeAgentSdkAvailability;

  if (tools.kind === 'absent') {
    availability = 'available';
  } else {
    const entries = await resolveList(tools, analysis, allowedReferences, resolveStaticString);

    if (entries === null) {
      availability = 'unresolved';
    } else if (entries.includes('Agent')) {
      availability = 'available';
    } else if (
      entries.some(
        (entry) =>
          entry === 'Task' ||
          entry.includes('*') ||
          entry.startsWith('Agent(') ||
          entry.startsWith('Task('),
      )
    ) {
      availability = 'unresolved';
    } else {
      availability = 'unavailable';
    }
  }

  availability = await applyDenyList(
    availability,
    disallowedTools,
    analysis,
    allowedReferences,
    'Agent',
    resolveStaticString,
    'Task',
  );

  return availability === 'available' &&
    (agentSelection.kind !== 'absent' || toolAliases.kind !== 'absent')
    ? 'unresolved'
    : availability;
};

/**
 * Derives query- or subagent-level availability of one exact SDK MCP tool.
 * @param analysis The source containing the availability relationships.
 * @param current The inherited availability state.
 * @param tools The optional explicit allow-list relationship.
 * @param disallowedTools The deny relationship.
 * @param agentSelection The unsupported main-thread selection relationship when query-level.
 * @param toolAliases The unsupported alias relationship when query-level.
 * @param allowedReferences Supported references to shared list constants.
 * @param runtimeName The exact fully qualified runtime tool name.
 * @param serverKey The canonical query-level server key.
 * @param resolveStaticString The operation-local exact string resolver.
 * @returns The refined availability state.
 */
export const classifyClaudeAgentSdkMcpToolAvailability = async (
  analysis: IClaudeAgentSdkSourceAnalysis,
  current: IClaudeAgentSdkAvailability,
  tools: IClaudeAgentSdkRelationship | null,
  disallowedTools: IClaudeAgentSdkRelationship,
  agentSelection: IClaudeAgentSdkRelationship | null,
  toolAliases: IClaudeAgentSdkRelationship | null,
  allowedReferences: ReadonlySet<ts.Identifier>,
  runtimeName: string,
  serverKey: string,
  resolveStaticString: IStaticStringResolver,
): Promise<IClaudeAgentSdkAvailability> => {
  let availability = current;

  if (availability !== 'unavailable' && tools !== null && tools.kind !== 'absent') {
    const entries = await resolveList(tools, analysis, allowedReferences, resolveStaticString);

    if (
      entries === null ||
      entries.some((entry) => entry.includes('*') || isScopedPermission(entry))
    ) {
      availability = 'unresolved';
    } else {
      availability = entries.includes(runtimeName) ? availability : 'unavailable';
    }
  }

  availability = await applyDenyList(
    availability,
    disallowedTools,
    analysis,
    allowedReferences,
    runtimeName,
    resolveStaticString,
    undefined,
    `mcp__${serverKey}`,
  );

  return availability === 'available' &&
    ((agentSelection !== null && agentSelection.kind !== 'absent') ||
      (toolAliases !== null && toolAliases.kind !== 'absent'))
    ? 'unresolved'
    : availability;
};

/** Collects direct identifier relationships allowed to share immutable module collections. */
export const collectClaudeAgentSdkRelationshipIdentifiers = (
  relationships: readonly IClaudeAgentSdkRelationship[],
): ReadonlySet<ts.Identifier> =>
  new Set(
    relationships.flatMap((relationship) => {
      if (relationship.kind !== 'present') {
        return [];
      }

      const candidate = unwrapExpression(relationship.expression);
      return ts.isIdentifier(candidate) ? [candidate] : [];
    }),
  );
