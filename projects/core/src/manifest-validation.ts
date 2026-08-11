import type { IRepositoryPath } from '@moldea.ai/repository';

import type { IFrameworkAdapterSnapshot } from './options.js';
import { escapeJsonPointerSegment, type ICoreDiagnosticCollector } from './diagnostic-utilities.js';
import type { IDiagnosticEntity, ISourceRange } from './diagnostics.js';
import {
  compareExactStrings,
  hasNonWhitespace,
  hasUnsupportedGlobMetacharacter,
  isCanonicalMoldeaPath,
  isCapabilityDescription,
  isContextPath,
  isDecisionPath,
  isMirrorPath,
  isNonEmptySingleLine,
  isRepositorySymbol,
  isReservedId,
  isRuntimeGuidancePath,
  isSimpleGlob,
  isStableId,
  isVariableId,
  parseManifestPath,
  sortRepositoryReferences,
} from './format-validation.js';
import type {
  IAgentBindingsManifestEntry,
  IAgentManifestEntry,
  IFrameworkManifestEntry,
  IMoldeaManifestV1,
  IRelationshipManifestEntry,
  IRepositoryFormatVersion,
  IRepositoryReference,
  IRuntimeVariableManifestEntry,
  ISkillManifestEntry,
  IToolManifestEntry,
  IUnresolvedRequirementEffect,
  IUnresolvedRequirementManifestEntry,
} from './format.js';
import { createNullPrototypeRecord } from './immutable.js';
import type { IYamlNode, IYamlScalarNode } from './yaml.js';

interface IManifestValidationContext {
  readonly adapters: ReadonlyMap<string, IFrameworkAdapterSnapshot>;
  readonly diagnostics: ICoreDiagnosticCollector;
  readonly mirrorPaths: Set<string>;
  readonly path: IRepositoryPath;
}

interface IMappingEntry {
  readonly key: IYamlScalarNode;
  readonly value: IYamlNode;
}

const childPointer = (pointer: string, key: string): string => {
  return `${pointer}/${escapeJsonPointerSegment(key)}`;
};

const addInvalidValue = (
  context: IManifestValidationContext,
  pointer: string,
  range: ISourceRange | null,
  reason: string,
  entity: IDiagnosticEntity | null = null,
): void => {
  context.diagnostics.add({
    code: 'MOLDEA_MANIFEST_VALUE_INVALID',
    details: { reason },
    entity,
    path: context.path,
    pointer,
    range,
  });
};

const readMapping = (
  node: IYamlNode,
  pointer: string,
  allowedProperties: ReadonlySet<string> | null,
  context: IManifestValidationContext,
  entity: IDiagnosticEntity | null = null,
): ReadonlyMap<string, IMappingEntry> | null => {
  if (node.kind !== 'mapping') {
    addInvalidValue(context, pointer, node.range, 'mapping-required', entity);
    return null;
  }

  const entries = new Map<string, IMappingEntry>();

  for (const entry of node.entries) {
    if (entry.key.kind !== 'scalar' || typeof entry.key.value !== 'string') {
      addInvalidValue(context, pointer, entry.key.range, 'string-key-required', entity);
      continue;
    }

    const key = entry.key.value;

    if (allowedProperties !== null && !allowedProperties.has(key)) {
      context.diagnostics.add({
        code: 'MOLDEA_MANIFEST_PROPERTY_UNKNOWN',
        entity,
        path: context.path,
        pointer: childPointer(pointer, key),
        range: entry.key.range,
      });
      continue;
    }

    entries.set(key, { key: entry.key, value: entry.value });
  }

  return entries;
};

const readString = (
  entry: IMappingEntry | undefined,
  pointer: string,
  context: IManifestValidationContext,
  options: {
    readonly entity?: IDiagnosticEntity;
    readonly required?: boolean;
    readonly singleLine?: boolean;
  } = {},
): string | null => {
  if (entry === undefined) {
    if (options.required === true) {
      addInvalidValue(context, pointer, null, 'required', options.entity ?? null);
    }

    return null;
  }

  if (entry.value.kind !== 'scalar' || typeof entry.value.value !== 'string') {
    addInvalidValue(context, pointer, entry.value.range, 'string-required', options.entity ?? null);
    return null;
  }

  const value = entry.value.value;

  if (!hasNonWhitespace(value) || (options.singleLine === true && !isNonEmptySingleLine(value))) {
    addInvalidValue(context, pointer, entry.value.range, 'string-invalid', options.entity ?? null);
    return null;
  }

  return value;
};

const validateStableId = (
  value: string,
  range: ISourceRange,
  pointer: string,
  context: IManifestValidationContext,
  entity: IDiagnosticEntity | null = null,
): boolean => {
  if (!isStableId(value)) {
    context.diagnostics.add({
      code: 'MOLDEA_ID_INVALID',
      entity,
      path: context.path,
      pointer,
      range,
    });
    return false;
  }

  if (isReservedId(value)) {
    context.diagnostics.add({
      code: 'MOLDEA_ID_RESERVED',
      entity,
      path: context.path,
      pointer,
      range,
    });
    return false;
  }

  return true;
};

const readReference = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  entity: IDiagnosticEntity | null = null,
): IRepositoryReference | null => {
  const entries = readMapping(node, pointer, new Set(['path', 'symbol']), context, entity);

  if (entries === null) {
    return null;
  }

  const pathEntry = entries.get('path');

  if (pathEntry?.value.kind !== 'scalar' || typeof pathEntry.value.value !== 'string') {
    context.diagnostics.add({
      code: 'MOLDEA_PATH_INVALID',
      details: { reason: pathEntry === undefined ? 'missing' : 'type' },
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'path'),
      range: pathEntry?.value.range ?? null,
    });
    return null;
  }

  const path = parseManifestPath(pathEntry.value.value);

  if (path === null) {
    context.diagnostics.add({
      code: 'MOLDEA_PATH_INVALID',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'path'),
      range: pathEntry.value.range,
    });
    return null;
  }

  const symbolEntry = entries.get('symbol');

  if (symbolEntry === undefined) {
    return { path };
  }

  if (
    symbolEntry.value.kind !== 'scalar' ||
    typeof symbolEntry.value.value !== 'string' ||
    !isRepositorySymbol(symbolEntry.value.value)
  ) {
    context.diagnostics.add({
      code: 'MOLDEA_SYMBOL_INVALID',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'symbol'),
      range: symbolEntry.value.range,
    });
    return null;
  }

  if (isCanonicalMoldeaPath(path)) {
    context.diagnostics.add({
      code: 'MOLDEA_SYMBOL_FORBIDDEN',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'symbol'),
      range: symbolEntry.value.range,
    });
    return null;
  }

  return { path, symbol: symbolEntry.value.value };
};

const readReferenceList = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  entity: IDiagnosticEntity | null = null,
): readonly IRepositoryReference[] => {
  if (node.kind !== 'sequence' || node.items.length === 0) {
    addInvalidValue(context, pointer, node.range, 'non-empty-sequence-required', entity);
    return [];
  }

  const references: IRepositoryReference[] = [];
  const seen = new Set<string>();

  node.items.forEach((item, index) => {
    const reference = readReference(item, childPointer(pointer, String(index)), context, entity);

    if (reference === null) {
      return;
    }

    const key = `${reference.path}\0${reference.symbol ?? ''}`;

    if (seen.has(key)) {
      context.diagnostics.add({
        code: 'MOLDEA_PATH_DUPLICATE',
        entity,
        path: context.path,
        pointer: childPointer(pointer, String(index)),
        range: item.range,
      });
      return;
    }

    seen.add(key);
    references.push(reference);
  });

  return sortRepositoryReferences(references);
};

const readAffectedBy = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  entity: IDiagnosticEntity | null = null,
): readonly string[] => {
  if (node.kind !== 'sequence' || node.items.length === 0) {
    addInvalidValue(context, pointer, node.range, 'non-empty-sequence-required', entity);
    return [];
  }

  const values: string[] = [];
  const seen = new Set<string>();

  node.items.forEach((item, index) => {
    const itemPointer = childPointer(pointer, String(index));

    if (item.kind !== 'scalar' || typeof item.value !== 'string') {
      addInvalidValue(context, itemPointer, item.range, 'string-required', entity);
      return;
    }

    const isGlob = item.value.includes('*') || hasUnsupportedGlobMetacharacter(item.value);
    const isValid = isGlob ? isSimpleGlob(item.value) : parseManifestPath(item.value) !== null;

    if (!isValid) {
      context.diagnostics.add({
        code: isGlob ? 'MOLDEA_GLOB_INVALID' : 'MOLDEA_PATH_INVALID',
        entity,
        path: context.path,
        pointer: itemPointer,
        range: item.range,
      });
      return;
    }

    if (seen.has(item.value)) {
      context.diagnostics.add({
        code: isGlob ? 'MOLDEA_PATTERN_DUPLICATE' : 'MOLDEA_PATH_DUPLICATE',
        entity,
        path: context.path,
        pointer: itemPointer,
        range: item.range,
      });
      return;
    }

    seen.add(item.value);
    values.push(item.value);
  });

  return values.sort(compareExactStrings);
};

const readRelationship = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
): IRelationshipManifestEntry | null => {
  const entries = readMapping(node, pointer, new Set(['affectedBy', 'bindings']), context);

  if (entries === null) {
    return null;
  }

  const bindingsEntry = entries.get('bindings');
  const affectedByEntry = entries.get('affectedBy');

  if (bindingsEntry === undefined && affectedByEntry === undefined) {
    context.diagnostics.add({
      code: 'MOLDEA_CONTEXT_RELATIONSHIP_EMPTY',
      path: context.path,
      pointer,
      range: node.range,
    });
  }

  return {
    ...(bindingsEntry === undefined
      ? {}
      : {
          bindings: readReferenceList(
            bindingsEntry.value,
            childPointer(pointer, 'bindings'),
            context,
          ),
        }),
    ...(affectedByEntry === undefined
      ? {}
      : {
          affectedBy: readAffectedBy(
            affectedByEntry.value,
            childPointer(pointer, 'affectedBy'),
            context,
          ),
        }),
  };
};

const readRelationshipRecord = (
  node: IYamlNode,
  pointer: string,
  kind: 'context' | 'decision',
  context: IManifestValidationContext,
): Readonly<Record<string, IRelationshipManifestEntry>> | null => {
  const entries = readMapping(node, pointer, null, context);

  if (entries === null) {
    return null;
  }

  const normalized: Array<readonly [string, IRelationshipManifestEntry]> = [];

  for (const [key, entry] of [...entries].sort(([left], [right]) =>
    compareExactStrings(left, right),
  )) {
    const path = parseManifestPath(key);
    const validPath =
      path !== null && (kind === 'context' ? isContextPath(path, true) : isDecisionPath(path));

    if (!validPath) {
      context.diagnostics.add({
        code:
          kind === 'context' ? 'MOLDEA_CONTEXT_PATH_INVALID' : 'MOLDEA_DECISION_FILENAME_INVALID',
        path: context.path,
        pointer: childPointer(pointer, key),
        range: entry.key.range,
      });
      continue;
    }

    const relationship = readRelationship(entry.value, childPointer(pointer, key), context);

    if (relationship !== null) {
      normalized.push([key, relationship]);
    }
  }

  return createNullPrototypeRecord(normalized);
};

const readPathList = (
  node: IYamlNode,
  pointer: string,
  kind: 'context' | 'decision' | 'mirror',
  context: IManifestValidationContext,
  entity: IDiagnosticEntity,
): readonly IRepositoryPath[] => {
  if (node.kind !== 'sequence') {
    addInvalidValue(context, pointer, node.range, 'sequence-required', entity);
    return [];
  }

  const paths: IRepositoryPath[] = [];
  const seen = new Set<string>();

  node.items.forEach((item, index) => {
    const itemPointer = childPointer(pointer, String(index));

    if (item.kind !== 'scalar' || typeof item.value !== 'string') {
      addInvalidValue(context, itemPointer, item.range, 'string-required', entity);
      return;
    }

    const path = parseManifestPath(item.value);
    const valid =
      path !== null &&
      (kind === 'context'
        ? isContextPath(path, false)
        : kind === 'decision'
          ? isDecisionPath(path)
          : isMirrorPath(path));

    if (!valid || path === null) {
      const code =
        kind === 'context'
          ? 'MOLDEA_CONTEXT_PATH_INVALID'
          : kind === 'decision'
            ? 'MOLDEA_DECISION_FILENAME_INVALID'
            : path !== null && !isMirrorPath(path)
              ? 'MOLDEA_MIRROR_PATH_INSIDE_MOLDEA'
              : 'MOLDEA_MIRROR_PATH_INVALID';
      context.diagnostics.add({
        code,
        entity,
        path: context.path,
        pointer: itemPointer,
        range: item.range,
      });
      return;
    }

    if (seen.has(path)) {
      context.diagnostics.add({
        code: kind === 'mirror' ? 'MOLDEA_MIRROR_PATH_DUPLICATE' : 'MOLDEA_PATH_DUPLICATE',
        entity,
        path: context.path,
        pointer: itemPointer,
        range: item.range,
      });
      return;
    }

    if (kind === 'mirror' && context.mirrorPaths.has(path)) {
      context.diagnostics.add({
        code: 'MOLDEA_MIRROR_PATH_DUPLICATE',
        entity,
        path: context.path,
        pointer: itemPointer,
        range: item.range,
      });
      return;
    }

    seen.add(path);
    if (kind === 'mirror') {
      context.mirrorPaths.add(path);
    }
    paths.push(path);
  });

  return paths.sort(compareExactStrings);
};

const readFramework = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId: string,
): IFrameworkManifestEntry | null => {
  const entity = { agentId };
  const entries = readMapping(node, pointer, new Set(['guidance', 'id']), context, entity);

  if (entries === null) {
    return null;
  }

  const idEntry = entries.get('id');

  if (idEntry?.value.kind !== 'scalar' || typeof idEntry.value.value !== 'string') {
    context.diagnostics.add({
      code: 'MOLDEA_FRAMEWORK_ID_INVALID',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'id'),
      range: idEntry?.value.range ?? null,
    });
    return null;
  }

  const id = idEntry.value.value;

  if (!isStableId(id) || isReservedId(id)) {
    context.diagnostics.add({
      code: 'MOLDEA_FRAMEWORK_ID_INVALID',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'id'),
      range: idEntry.value.range,
    });
  } else if (id !== 'custom') {
    const adapter = context.adapters.get(id);

    if (adapter === undefined) {
      context.diagnostics.add({
        code: 'MOLDEA_FRAMEWORK_ADAPTER_UNAVAILABLE',
        entity: { adapterId: id, agentId },
        path: context.path,
        pointer: childPointer(pointer, 'id'),
        range: idEntry.value.range,
      });
    } else if (!adapter.supportedRepositoryFormatVersions.includes(1)) {
      context.diagnostics.add({
        code: 'MOLDEA_FRAMEWORK_ADAPTER_FORMAT_UNSUPPORTED',
        entity: { adapterId: id, agentId },
        path: context.path,
        pointer: childPointer(pointer, 'id'),
        range: idEntry.value.range,
      });
    }
  }

  const guidanceEntry = entries.get('guidance');
  let guidance: IRepositoryPath | null = null;

  if (guidanceEntry !== undefined) {
    if (guidanceEntry.value.kind === 'scalar' && typeof guidanceEntry.value.value === 'string') {
      const candidate = parseManifestPath(guidanceEntry.value.value);

      if (candidate !== null && isRuntimeGuidancePath(candidate)) {
        guidance = candidate;
      } else {
        context.diagnostics.add({
          code: 'MOLDEA_PATH_INVALID',
          details: { reason: 'runtime-guidance' },
          entity,
          path: context.path,
          pointer: childPointer(pointer, 'guidance'),
          range: guidanceEntry.value.range,
        });
      }
    } else {
      context.diagnostics.add({
        code: 'MOLDEA_PATH_INVALID',
        details: { reason: 'runtime-guidance' },
        entity,
        path: context.path,
        pointer: childPointer(pointer, 'guidance'),
        range: guidanceEntry.value.range,
      });
    }
  }

  return { id, ...(guidance === null ? {} : { guidance }) };
};

const readVariables = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId: string,
): Readonly<Record<string, IRuntimeVariableManifestEntry>> | null => {
  const entries = readMapping(node, pointer, null, context, { agentId });

  if (entries === null) {
    return null;
  }

  const normalized: Array<readonly [string, IRuntimeVariableManifestEntry]> = [];

  for (const [variableId, entry] of [...entries].sort(([left], [right]) =>
    compareExactStrings(left, right),
  )) {
    const entity = { agentId, variableId };

    if (!isVariableId(variableId)) {
      context.diagnostics.add({
        code: 'MOLDEA_VARIABLE_ID_INVALID',
        entity,
        path: context.path,
        pointer: childPointer(pointer, variableId),
        range: entry.key.range,
      });
    }

    const variablePointer = childPointer(pointer, variableId);
    const variableEntries = readMapping(
      entry.value,
      variablePointer,
      new Set(['description']),
      context,
      entity,
    );

    if (variableEntries === null) {
      continue;
    }

    const description = readString(
      variableEntries.get('description'),
      childPointer(variablePointer, 'description'),
      context,
      { entity, required: true },
    );

    if (description !== null) {
      normalized.push([variableId, { description }]);
    }
  }

  return createNullPrototypeRecord(normalized);
};

const readBindings = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId: string,
  declaredVariables: ReadonlySet<string>,
): IAgentBindingsManifestEntry | null => {
  const entity = { agentId };
  const entries = readMapping(
    node,
    pointer,
    new Set([
      'inputSchema',
      'instructionLoader',
      'outputSchema',
      'runtimeAgent',
      'variableProviders',
    ]),
    context,
    entity,
  );

  if (entries === null) {
    return null;
  }

  const referenceProperty = (
    key: 'inputSchema' | 'instructionLoader' | 'outputSchema' | 'runtimeAgent',
  ) => {
    const entry = entries.get(key);
    return entry === undefined
      ? null
      : readReference(entry.value, childPointer(pointer, key), context, entity);
  };
  const inputSchema = referenceProperty('inputSchema');
  const instructionLoader = referenceProperty('instructionLoader');
  const outputSchema = referenceProperty('outputSchema');
  const runtimeAgent = referenceProperty('runtimeAgent');
  const providersEntry = entries.get('variableProviders');
  let variableProviders: Readonly<Record<string, IRepositoryReference>> | null = null;

  if (providersEntry !== undefined) {
    const providers = readMapping(
      providersEntry.value,
      childPointer(pointer, 'variableProviders'),
      null,
      context,
      entity,
    );

    if (providers !== null) {
      const normalized: Array<readonly [string, IRepositoryReference]> = [];

      for (const [variableId, providerEntry] of [...providers].sort(([left], [right]) =>
        compareExactStrings(left, right),
      )) {
        const variableEntity = { agentId, variableId };
        const providerPointer = childPointer(
          childPointer(pointer, 'variableProviders'),
          variableId,
        );

        if (!isVariableId(variableId)) {
          context.diagnostics.add({
            code: 'MOLDEA_VARIABLE_ID_INVALID',
            entity: variableEntity,
            path: context.path,
            pointer: providerPointer,
            range: providerEntry.key.range,
          });
        } else if (!declaredVariables.has(variableId)) {
          context.diagnostics.add({
            code: 'MOLDEA_VARIABLE_PROVIDER_UNDECLARED',
            entity: variableEntity,
            path: context.path,
            pointer: providerPointer,
            range: providerEntry.key.range,
          });
        }

        const reference = readReference(
          providerEntry.value,
          providerPointer,
          context,
          variableEntity,
        );

        if (reference !== null) {
          normalized.push([variableId, reference]);
        }
      }

      variableProviders = createNullPrototypeRecord(normalized);
    }
  }

  return {
    ...(runtimeAgent === null ? {} : { runtimeAgent }),
    ...(inputSchema === null ? {} : { inputSchema }),
    ...(outputSchema === null ? {} : { outputSchema }),
    ...(instructionLoader === null ? {} : { instructionLoader }),
    ...(variableProviders === null ? {} : { variableProviders }),
  };
};

const readCapability = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId: string,
  capabilityId: string,
  kind: 'tool' | 'skill',
): IToolManifestEntry | ISkillManifestEntry | null => {
  const entity = { agentId, capabilityId, capabilityKind: kind } as const;
  const allowed =
    kind === 'tool'
      ? new Set([
          'affectedBy',
          'description',
          'implementation',
          'inputSchema',
          'name',
          'outputSchema',
          'registration',
        ])
      : new Set(['affectedBy', 'description', 'implementation', 'name', 'registration']);
  const entries = readMapping(node, pointer, allowed, context, entity);

  if (entries === null) {
    return null;
  }

  const name = readString(entries.get('name'), childPointer(pointer, 'name'), context, {
    entity,
    required: true,
    singleLine: true,
  });
  const descriptionEntry = entries.get('description');
  let description: string | null = null;

  if (descriptionEntry === undefined) {
    context.diagnostics.add({
      code: 'MOLDEA_CAPABILITY_DESCRIPTION_MISSING',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'description'),
    });
  } else if (
    descriptionEntry.value.kind !== 'scalar' ||
    typeof descriptionEntry.value.value !== 'string' ||
    !isCapabilityDescription(descriptionEntry.value.value)
  ) {
    context.diagnostics.add({
      code: 'MOLDEA_CAPABILITY_DESCRIPTION_INVALID',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'description'),
      range: descriptionEntry.value.range,
    });
  } else {
    description = descriptionEntry.value.value;
  }

  const implementationEntry = entries.get('implementation');
  let implementation: IRepositoryReference | null = null;

  if (implementationEntry === undefined) {
    context.diagnostics.add({
      code:
        kind === 'tool'
          ? 'MOLDEA_TOOL_IMPLEMENTATION_MISSING'
          : 'MOLDEA_SKILL_IMPLEMENTATION_MISSING',
      entity,
      path: context.path,
      pointer: childPointer(pointer, 'implementation'),
    });
  } else {
    implementation = readReference(
      implementationEntry.value,
      childPointer(pointer, 'implementation'),
      context,
      entity,
    );
  }

  const optionalReference = (key: 'inputSchema' | 'outputSchema' | 'registration') => {
    const entry = entries.get(key);
    return entry === undefined
      ? null
      : readReference(entry.value, childPointer(pointer, key), context, entity);
  };
  const registration = optionalReference('registration');
  const inputSchema = kind === 'tool' ? optionalReference('inputSchema') : null;
  const outputSchema = kind === 'tool' ? optionalReference('outputSchema') : null;
  const affectedByEntry = entries.get('affectedBy');
  const affectedBy =
    affectedByEntry === undefined
      ? null
      : readAffectedBy(affectedByEntry.value, childPointer(pointer, 'affectedBy'), context, entity);

  if (name === null || description === null || implementation === null) {
    return null;
  }

  return {
    name,
    description,
    implementation,
    ...(registration === null ? {} : { registration }),
    ...(inputSchema === null ? {} : { inputSchema }),
    ...(outputSchema === null ? {} : { outputSchema }),
    ...(affectedBy === null ? {} : { affectedBy }),
  };
};

const readCapabilities = <Value extends IToolManifestEntry | ISkillManifestEntry>(
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId: string,
  kind: 'tool' | 'skill',
): Readonly<Record<string, Value>> | null => {
  const entries = readMapping(node, pointer, null, context, { agentId });

  if (entries === null) {
    return null;
  }

  const normalized: Array<readonly [string, Value]> = [];

  for (const [capabilityId, entry] of [...entries].sort(([left], [right]) =>
    compareExactStrings(left, right),
  )) {
    const entity = { agentId, capabilityId, capabilityKind: kind } as const;
    const capabilityPointer = childPointer(pointer, capabilityId);
    validateStableId(capabilityId, entry.key.range, capabilityPointer, context, entity);
    const capability = readCapability(
      entry.value,
      capabilityPointer,
      context,
      agentId,
      capabilityId,
      kind,
    );

    if (capability !== null) {
      normalized.push([capabilityId, capability as Value]);
    }
  }

  return createNullPrototypeRecord(normalized);
};

const readUnresolved = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId?: string,
): Readonly<Record<string, IUnresolvedRequirementManifestEntry>> | null => {
  const entries = readMapping(
    node,
    pointer,
    null,
    context,
    agentId === undefined ? null : { agentId },
  );

  if (entries === null) {
    return null;
  }

  const normalized: Array<readonly [string, IUnresolvedRequirementManifestEntry]> = [];

  for (const [requirementId, entry] of [...entries].sort(([left], [right]) =>
    compareExactStrings(left, right),
  )) {
    const entity = agentId === undefined ? null : { agentId };
    const requirementPointer = childPointer(pointer, requirementId);
    validateStableId(requirementId, entry.key.range, requirementPointer, context, entity);
    const requirementEntries = readMapping(
      entry.value,
      requirementPointer,
      new Set(['category', 'description', 'effect', 'reference', 'related', 'resolution']),
      context,
      entity,
    );

    if (requirementEntries === null) {
      continue;
    }

    const category = readString(
      requirementEntries.get('category'),
      childPointer(requirementPointer, 'category'),
      context,
      { ...(entity === null ? {} : { entity }), required: true },
    );

    if (category !== null && !isStableId(category)) {
      context.diagnostics.add({
        code: 'MOLDEA_ID_INVALID',
        entity,
        path: context.path,
        pointer: childPointer(requirementPointer, 'category'),
        range: requirementEntries.get('category')?.value.range ?? null,
      });
    }

    const effectEntry = requirementEntries.get('effect');
    let effect: IUnresolvedRequirementEffect | null = null;

    if (
      effectEntry?.value.kind === 'scalar' &&
      (effectEntry.value.value === 'blocking' ||
        effectEntry.value.value === 'warning' ||
        effectEntry.value.value === 'informational')
    ) {
      effect = effectEntry.value.value;
    } else {
      addInvalidValue(
        context,
        childPointer(requirementPointer, 'effect'),
        effectEntry?.value.range ?? null,
        effectEntry === undefined ? 'required' : 'enum',
        entity,
      );
    }

    const description = readString(
      requirementEntries.get('description'),
      childPointer(requirementPointer, 'description'),
      context,
      { ...(entity === null ? {} : { entity }), required: true },
    );
    const resolution = readString(
      requirementEntries.get('resolution'),
      childPointer(requirementPointer, 'resolution'),
      context,
      { ...(entity === null ? {} : { entity }), required: true },
    );
    const relatedEntry = requirementEntries.get('related');
    const related =
      relatedEntry === undefined
        ? null
        : readReferenceList(
            relatedEntry.value,
            childPointer(requirementPointer, 'related'),
            context,
            entity,
          );
    const reference = readString(
      requirementEntries.get('reference'),
      childPointer(requirementPointer, 'reference'),
      context,
      { ...(entity === null ? {} : { entity }), singleLine: true },
    );

    if (category !== null && effect !== null && description !== null && resolution !== null) {
      normalized.push([
        requirementId,
        {
          category,
          effect,
          description,
          resolution,
          ...(related === null ? {} : { related }),
          ...(reference === null ? {} : { reference }),
        },
      ]);
    }
  }

  return createNullPrototypeRecord(normalized);
};

const findMappingProperty = (node: IYamlNode, property: string): IYamlNode | null => {
  if (node.kind !== 'mapping') {
    return null;
  }

  for (const entry of node.entries) {
    if (entry.key.kind === 'scalar' && entry.key.value === property) {
      return entry.value;
    }
  }

  return null;
};

/**
 * Detects a supported repository-format version without treating the remaining manifest as valid.
 * @param node The trustworthy strict-YAML manifest root.
 * @returns The supported parsed version when its declaration is independently unambiguous.
 */
export const detectSupportedManifestVersion = (
  node: IYamlNode,
): IRepositoryFormatVersion | null => {
  if (node.kind !== 'mapping') {
    return null;
  }

  const versionNode = findMappingProperty(node, 'version');

  return versionNode?.kind === 'scalar' && versionNode.value === 1n ? 1 : null;
};

const validateAgentOwnedIdUniqueness = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId: string,
): void => {
  const seen = new Set<string>();

  for (const property of ['tools', 'skills', 'unresolved']) {
    const record = findMappingProperty(node, property);

    if (record?.kind !== 'mapping') {
      continue;
    }

    for (const entry of record.entries) {
      if (entry.key.kind !== 'scalar' || typeof entry.key.value !== 'string') {
        continue;
      }

      if (seen.has(entry.key.value)) {
        context.diagnostics.add({
          code: 'MOLDEA_ID_DUPLICATE',
          entity: { agentId },
          path: context.path,
          pointer: childPointer(childPointer(pointer, property), entry.key.value),
          range: entry.key.range,
        });
      }

      seen.add(entry.key.value);
    }
  }
};

const readAgent = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
  agentId: string,
): IAgentManifestEntry | null => {
  const entity = { agentId };
  const entries = readMapping(
    node,
    pointer,
    new Set([
      'affectedBy',
      'bindings',
      'context',
      'decisions',
      'framework',
      'mirrors',
      'skills',
      'tools',
      'unresolved',
      'variables',
    ]),
    context,
    entity,
  );

  if (entries === null) {
    return null;
  }

  validateAgentOwnedIdUniqueness(node, pointer, context, agentId);
  const frameworkEntry = entries.get('framework');
  let framework: IFrameworkManifestEntry | null = null;

  if (frameworkEntry === undefined) {
    addInvalidValue(context, childPointer(pointer, 'framework'), null, 'required', entity);
  } else {
    framework = readFramework(
      frameworkEntry.value,
      childPointer(pointer, 'framework'),
      context,
      agentId,
    );
  }

  const variablesEntry = entries.get('variables');
  const variables =
    variablesEntry === undefined
      ? null
      : readVariables(variablesEntry.value, childPointer(pointer, 'variables'), context, agentId);
  const declaredVariables = new Set(Object.keys(variables ?? {}));
  const bindingsEntry = entries.get('bindings');
  const bindings =
    bindingsEntry === undefined
      ? null
      : readBindings(
          bindingsEntry.value,
          childPointer(pointer, 'bindings'),
          context,
          agentId,
          declaredVariables,
        );
  const contextEntry = entries.get('context');
  const contextPaths =
    contextEntry === undefined
      ? null
      : readPathList(
          contextEntry.value,
          childPointer(pointer, 'context'),
          'context',
          context,
          entity,
        );
  const decisionsEntry = entries.get('decisions');
  const decisions =
    decisionsEntry === undefined
      ? null
      : readPathList(
          decisionsEntry.value,
          childPointer(pointer, 'decisions'),
          'decision',
          context,
          entity,
        );
  const toolsEntry = entries.get('tools');
  const tools =
    toolsEntry === undefined
      ? null
      : readCapabilities<IToolManifestEntry>(
          toolsEntry.value,
          childPointer(pointer, 'tools'),
          context,
          agentId,
          'tool',
        );
  const skillsEntry = entries.get('skills');
  const skills =
    skillsEntry === undefined
      ? null
      : readCapabilities<ISkillManifestEntry>(
          skillsEntry.value,
          childPointer(pointer, 'skills'),
          context,
          agentId,
          'skill',
        );
  const affectedByEntry = entries.get('affectedBy');
  const affectedBy =
    affectedByEntry === undefined
      ? null
      : readAffectedBy(affectedByEntry.value, childPointer(pointer, 'affectedBy'), context, entity);
  const mirrorsEntry = entries.get('mirrors');
  const mirrors =
    mirrorsEntry === undefined
      ? null
      : readPathList(
          mirrorsEntry.value,
          childPointer(pointer, 'mirrors'),
          'mirror',
          context,
          entity,
        );
  const unresolvedEntry = entries.get('unresolved');
  const unresolved =
    unresolvedEntry === undefined
      ? null
      : readUnresolved(
          unresolvedEntry.value,
          childPointer(pointer, 'unresolved'),
          context,
          agentId,
        );

  if (framework === null) {
    return null;
  }

  return {
    framework,
    ...(contextPaths === null ? {} : { context: contextPaths }),
    ...(decisions === null ? {} : { decisions }),
    ...(variables === null ? {} : { variables }),
    ...(bindings === null ? {} : { bindings }),
    ...(tools === null ? {} : { tools }),
    ...(skills === null ? {} : { skills }),
    ...(affectedBy === null ? {} : { affectedBy }),
    ...(mirrors === null ? {} : { mirrors }),
    ...(unresolved === null ? {} : { unresolved }),
  };
};

const readAgents = (
  node: IYamlNode,
  pointer: string,
  context: IManifestValidationContext,
): Readonly<Record<string, IAgentManifestEntry>> | null => {
  const entries = readMapping(node, pointer, null, context);

  if (entries === null) {
    return null;
  }

  const normalized: Array<readonly [string, IAgentManifestEntry]> = [];

  for (const [agentId, entry] of [...entries].sort(([left], [right]) =>
    compareExactStrings(left, right),
  )) {
    const agentPointer = childPointer(pointer, agentId);
    validateStableId(agentId, entry.key.range, agentPointer, context, { agentId });
    const agent = readAgent(entry.value, agentPointer, context, agentId);

    if (agent !== null) {
      normalized.push([agentId, agent]);
    }
  }

  return createNullPrototypeRecord(normalized);
};

/**
 * Validates and normalizes a strict YAML document as a version 1 moldea manifest.
 * @param node The parser-neutral YAML root node.
 * @param path The canonical or caller-supplied logical manifest path.
 * @param adapters The immutable configured adapter snapshots.
 * @param diagnostics The operation diagnostic collector.
 * @returns The normalized manifest when its supported version can be interpreted.
 */
export const validateManifest = (
  node: IYamlNode,
  path: IRepositoryPath,
  adapters: readonly IFrameworkAdapterSnapshot[],
  diagnostics: ICoreDiagnosticCollector,
): IMoldeaManifestV1 | null => {
  const context: IManifestValidationContext = {
    adapters: new Map(adapters.map((adapter) => [adapter.id, adapter])),
    diagnostics,
    mirrorPaths: new Set(),
    path,
  };

  if (node.kind !== 'mapping') {
    diagnostics.add({ code: 'MOLDEA_MANIFEST_ROOT_INVALID', path, range: node.range });
    return null;
  }

  const versionNode = findMappingProperty(node, 'version');

  if (versionNode === null) {
    diagnostics.add({ code: 'MOLDEA_MANIFEST_VERSION_MISSING', path, pointer: '/version' });
    return null;
  }

  const isIntegerSyntax = versionNode.kind === 'scalar' && typeof versionNode.value === 'bigint';

  if (!isIntegerSyntax || versionNode.kind !== 'scalar' || versionNode.value <= 0n) {
    diagnostics.add({
      code: 'MOLDEA_MANIFEST_VERSION_INVALID',
      path,
      pointer: '/version',
      range: versionNode.range,
    });
    return null;
  }

  if (versionNode.value !== 1n) {
    diagnostics.add({
      code: 'MOLDEA_MANIFEST_VERSION_UNSUPPORTED',
      path,
      pointer: '/version',
      range: versionNode.range,
    });
    return null;
  }

  const entries = readMapping(
    node,
    '',
    new Set(['agents', 'context', 'decisions', 'unresolved', 'version']),
    context,
  );

  if (entries === null) {
    return null;
  }

  const contextEntry = entries.get('context');
  const contextRelationships =
    contextEntry === undefined
      ? null
      : readRelationshipRecord(contextEntry.value, '/context', 'context', context);
  const decisionsEntry = entries.get('decisions');
  const decisionRelationships =
    decisionsEntry === undefined
      ? null
      : readRelationshipRecord(decisionsEntry.value, '/decisions', 'decision', context);
  const unresolvedEntry = entries.get('unresolved');
  const unresolved =
    unresolvedEntry === undefined
      ? null
      : readUnresolved(unresolvedEntry.value, '/unresolved', context);
  const agentsEntry = entries.get('agents');
  const agents =
    agentsEntry === undefined ? null : readAgents(agentsEntry.value, '/agents', context);

  return {
    version: 1,
    ...(contextRelationships === null ? {} : { context: contextRelationships }),
    ...(decisionRelationships === null ? {} : { decisions: decisionRelationships }),
    ...(unresolved === null ? {} : { unresolved }),
    ...(agents === null ? {} : { agents }),
  };
};
