import { validRange as isValidSemverRange } from 'semver';
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  type Document,
  type Node,
  type ParsedNode,
} from 'yaml';

import {
  ADAPTER_DISTRIBUTIONS,
  ADAPTER_IMPLEMENTATION_KINDS,
  ADAPTER_IMPLEMENTATION_STATUSES,
  BINDING_SUBJECTS,
  EVIDENCE_KINDS,
  OFFICIAL_RUNTIME_ADAPTER_PACKAGES,
  PACKAGE_ECOSYSTEMS,
  PACKAGE_ROLES,
  PATTERN_KINDS,
  PATTERN_SUPPORT_LEVELS,
  PROVIDER_LIMIT_KINDS,
  PROVIDER_LIMIT_SUBJECTS,
  RUNTIME_GUIDANCE_EXPECTATIONS,
  RUNTIME_TARGET_KINDS,
  RUNTIME_TARGET_SUPPORT_LEVELS,
} from './constants.ts';
import { normalizeRuntimeCompatibilityMatrix } from './transformers.ts';
import type {
  IAdapterImplementationStatus,
  IBindingSupportLevel,
  IProviderLimitKind,
  IRuntimeCompatibilityMatrix,
  IRuntimeCompatibilityValidationIssue,
  IRuntimeCompatibilityValidationResult,
} from './types.ts';
import {
  compareExactStrings,
  isRecord,
  isStableId,
  isStrictSingleLine,
  isStrictText,
  isUtcCalendarDate,
} from './utilities.ts';

const TOP_LEVEL_PROPERTIES = new Set(['adapters', 'version']);
const ADAPTER_PROPERTIES = new Set([
  'compatibleCoreRange',
  'implementation',
  'implementationStatus',
  'lastVerifiedAt',
  'notes',
  'replacement',
  'runtimeGuidance',
  'supportedRepositoryFormatVersions',
  'targets',
]);
const IMPLEMENTATION_PROPERTIES = new Set(['distribution', 'kind', 'package', 'versionRange']);
const RUNTIME_GUIDANCE_PROPERTIES = new Set(['expectation', 'notes']);
const TARGET_PROPERTIES = new Set([
  'bindingSupport',
  'evidenceKinds',
  'id',
  'kind',
  'knownLimitations',
  'language',
  'lastVerifiedAt',
  'packages',
  'patterns',
  'providerLimits',
  'supportLevel',
]);
const PACKAGE_PROPERTIES = new Set(['ecosystem', 'name', 'role', 'versionRange']);
const BINDING_PROPERTIES = new Set(['relationship', 'symbol']);
const PATTERN_PROPERTIES = new Set(['description', 'id', 'kind', 'notes', 'support']);
const PROVIDER_LIMIT_PROPERTIES = new Set([
  'description',
  'id',
  'kind',
  'reference',
  'subject',
  'value',
]);
const SUPPORT_FIELD_NAMES = [
  'supportedRepositoryFormatVersions',
  'compatibleCoreRange',
  'runtimeGuidance',
  'targets',
  'lastVerifiedAt',
] as const;
const SUPPORT_LEVEL_RANK: Record<IBindingSupportLevel, number> = {
  full: 2,
  none: 0,
  partial: 1,
};

const addIssue = (
  issues: IRuntimeCompatibilityValidationIssue[],
  path: string,
  message: string,
): void => {
  issues.push({ message, path });
};

const rejectUnknownProperties = (
  record: Record<string, unknown>,
  allowedProperties: ReadonlySet<string>,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  for (const property of Object.keys(record).sort(compareExactStrings)) {
    if (!allowedProperties.has(property)) {
      addIssue(issues, `${path}.${property}`, 'Unknown property.');
    }
  }
};

const requireRecord = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a mapping.');
    return null;
  }

  return value;
};

const requireArray = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): unknown[] | null => {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'Expected an array.');
    return null;
  }

  return value as unknown[];
};

const requireEnum = <T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): value is T => {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    addIssue(issues, path, `Expected one of: ${allowedValues.join(', ')}.`);
    return false;
  }

  return true;
};

const requireStrictSingleLine = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): value is string => {
  if (typeof value !== 'string' || !isStrictSingleLine(value)) {
    addIssue(
      issues,
      path,
      'Expected non-empty single-line text without surrounding whitespace or NUL.',
    );
    return false;
  }

  return true;
};

const requireStrictText = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): value is string => {
  if (typeof value !== 'string' || !isStrictText(value)) {
    addIssue(issues, path, 'Expected non-empty text containing non-whitespace and no NUL.');
    return false;
  }

  return true;
};

const requireStableId = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): value is string => {
  if (typeof value !== 'string' || !isStableId(value)) {
    addIssue(issues, path, 'Expected a non-reserved stable ID of at most 64 ASCII characters.');
    return false;
  }

  return true;
};

const requireDate = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): value is string => {
  if (typeof value !== 'string' || !isUtcCalendarDate(value)) {
    addIssue(issues, path, 'Expected a valid UTC date in YYYY-MM-DD form.');
    return false;
  }

  return true;
};

const requireSemverRange = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): value is string => {
  if (!requireStrictSingleLine(value, path, issues)) {
    return false;
  }

  if (isValidSemverRange(value) === null) {
    addIssue(issues, path, 'Expected a valid node-semver range.');
    return false;
  }

  return true;
};

const isValidNpmPackageSegment = (segment: string): boolean =>
  segment.length > 0 &&
  segment === segment.toLowerCase() &&
  segment[0] !== '.' &&
  segment[0] !== '_' &&
  !/[~'!()*]/u.test(segment) &&
  encodeURIComponent(segment) === segment;

const requireNpmPackageName = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): value is string => {
  if (!requireStrictSingleLine(value, path, issues)) {
    return false;
  }

  const segments = value.startsWith('@') ? value.slice(1).split('/') : [value];
  const isScopedName = value.startsWith('@');
  const isValid =
    value.length <= 214 &&
    value !== 'node_modules' &&
    value !== 'favicon.ico' &&
    segments.length === (isScopedName ? 2 : 1) &&
    segments.every(isValidNpmPackageSegment);

  if (!isValid) {
    addIssue(issues, path, 'Expected a valid npm package name.');
    return false;
  }

  return true;
};

const rejectDuplicateStrings = (
  values: readonly string[],
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const seenValues = new Set<string>();

  values.forEach((value, index) => {
    if (seenValues.has(value)) {
      addIssue(issues, `${path}[${index}]`, `Duplicate value: ${value}.`);
    }

    seenValues.add(value);
  });
};

const validateStringArray = (
  value: unknown,
  allowedValues: readonly string[],
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): string[] | null => {
  const values = requireArray(value, path, issues);

  if (values === null) {
    return null;
  }

  if (values.length === 0) {
    addIssue(issues, path, 'Expected a non-empty array.');
  }

  const strings: string[] = [];
  values.forEach((entry, index) => {
    if (typeof entry !== 'string' || !allowedValues.includes(entry)) {
      addIssue(issues, `${path}[${index}]`, `Expected one of: ${allowedValues.join(', ')}.`);
    } else {
      strings.push(entry);
    }
  });
  rejectDuplicateStrings(strings, path, issues);
  return strings;
};

const validateImplementation = (
  adapterId: string,
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): Record<string, unknown> | null => {
  const implementation = requireRecord(value, path, issues);

  if (implementation === null) {
    return null;
  }

  rejectUnknownProperties(implementation, IMPLEMENTATION_PROPERTIES, path, issues);
  const hasKind = requireEnum(
    implementation['kind'],
    ADAPTER_IMPLEMENTATION_KINDS,
    `${path}.kind`,
    issues,
  );
  requireEnum(
    implementation['distribution'],
    ADAPTER_DISTRIBUTIONS,
    `${path}.distribution`,
    issues,
  );
  const hasPackage = requireStrictSingleLine(implementation['package'], `${path}.package`, issues);

  if (hasPackage) {
    const expectedPackage =
      OFFICIAL_RUNTIME_ADAPTER_PACKAGES[
        adapterId as keyof typeof OFFICIAL_RUNTIME_ADAPTER_PACKAGES
      ];

    if (expectedPackage !== undefined && implementation['package'] !== expectedPackage) {
      addIssue(issues, `${path}.package`, `Expected owning package ${expectedPackage}.`);
    }
  }

  if (hasKind) {
    if (adapterId === 'custom' && implementation['kind'] !== 'built-in') {
      addIssue(issues, `${path}.kind`, 'The custom adapter must be built-in.');
    } else if (adapterId !== 'custom' && implementation['kind'] !== 'package') {
      addIssue(issues, `${path}.kind`, 'Only the custom adapter may be built-in.');
    }
  }

  if (adapterId === 'custom' && implementation['distribution'] !== 'public') {
    addIssue(issues, `${path}.distribution`, 'The built-in custom adapter must be public.');
  }

  return implementation;
};

const validateRuntimeGuidance = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const guidance = requireRecord(value, path, issues);

  if (guidance === null) {
    return;
  }

  rejectUnknownProperties(guidance, RUNTIME_GUIDANCE_PROPERTIES, path, issues);
  requireEnum(
    guidance['expectation'],
    RUNTIME_GUIDANCE_EXPECTATIONS,
    `${path}.expectation`,
    issues,
  );

  if (guidance['notes'] !== undefined) {
    requireStrictSingleLine(guidance['notes'], `${path}.notes`, issues);
  }
};

const validatePackageRequirements = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const requirements = requireArray(value, path, issues);

  if (requirements === null) {
    return;
  }

  if (requirements.length === 0) {
    addIssue(issues, path, 'Package targets require at least one package.');
  }

  let primaryCount = 0;
  const packageIdentities: string[] = [];

  requirements.forEach((value, index) => {
    const requirementPath = `${path}[${index}]`;
    const requirement = requireRecord(value, requirementPath, issues);

    if (requirement === null) {
      return;
    }

    rejectUnknownProperties(requirement, PACKAGE_PROPERTIES, requirementPath, issues);
    const ecosystem = requirement['ecosystem'];
    const name = requirement['name'];
    const role = requirement['role'];
    const versionRange = requirement['versionRange'];
    const hasEcosystem = requireEnum(
      ecosystem,
      PACKAGE_ECOSYSTEMS,
      `${requirementPath}.ecosystem`,
      issues,
    );
    const hasName = requireNpmPackageName(name, `${requirementPath}.name`, issues);
    const hasRole = requireEnum(role, PACKAGE_ROLES, `${requirementPath}.role`, issues);
    const rangePath = `${requirementPath}.versionRange`;

    if (hasEcosystem) {
      requireSemverRange(versionRange, rangePath, issues);
    }

    if (hasRole && role === 'primary') {
      primaryCount += 1;
    }

    if (hasName) {
      packageIdentities.push(name);
    }
  });

  if (primaryCount !== 1) {
    addIssue(issues, path, 'A package target must contain exactly one primary package.');
  }

  rejectDuplicateStrings(packageIdentities, path, issues);
};

const validateBindingSupport = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): boolean => {
  const bindings = requireRecord(value, path, issues);

  if (bindings === null) {
    return false;
  }

  rejectUnknownProperties(bindings, new Set(BINDING_SUBJECTS), path, issues);
  let hasPositiveSupport = false;

  for (const subject of BINDING_SUBJECTS) {
    if (bindings[subject] === undefined) {
      continue;
    }

    const bindingPath = `${path}.${subject}`;
    const binding = requireRecord(bindings[subject], bindingPath, issues);

    if (binding === null) {
      continue;
    }

    rejectUnknownProperties(binding, BINDING_PROPERTIES, bindingPath, issues);
    const hasRelationship = requireEnum(
      binding['relationship'],
      ['none', 'partial', 'full'],
      `${bindingPath}.relationship`,
      issues,
    );
    const hasSymbol = requireEnum(
      binding['symbol'],
      ['none', 'partial', 'full'],
      `${bindingPath}.symbol`,
      issues,
    );
    const relationship = binding['relationship'];
    const symbol = binding['symbol'];

    if (hasRelationship && relationship !== 'none') {
      hasPositiveSupport = true;
    }

    if (
      hasRelationship &&
      hasSymbol &&
      SUPPORT_LEVEL_RANK[symbol as IBindingSupportLevel] >
        SUPPORT_LEVEL_RANK[relationship as IBindingSupportLevel]
    ) {
      addIssue(
        issues,
        `${bindingPath}.symbol`,
        'Symbol support cannot exceed relationship support.',
      );
    }
  }

  return hasPositiveSupport;
};

const validatePatterns = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): boolean => {
  const patterns = requireArray(value, path, issues);

  if (patterns === null) {
    return false;
  }

  if (patterns.length === 0) {
    addIssue(issues, path, 'Expected a non-empty array when patterns are present.');
  }

  const patternIds: string[] = [];
  let hasPositiveSupport = false;

  patterns.forEach((value, index) => {
    const patternPath = `${path}[${index}]`;
    const pattern = requireRecord(value, patternPath, issues);

    if (pattern === null) {
      return;
    }

    rejectUnknownProperties(pattern, PATTERN_PROPERTIES, patternPath, issues);

    if (requireStableId(pattern['id'], `${patternPath}.id`, issues)) {
      patternIds.push(pattern['id']);
    }

    requireEnum(pattern['kind'], PATTERN_KINDS, `${patternPath}.kind`, issues);

    if (
      requireEnum(pattern['support'], PATTERN_SUPPORT_LEVELS, `${patternPath}.support`, issues) &&
      (pattern['support'] === 'full' || pattern['support'] === 'partial')
    ) {
      hasPositiveSupport = true;
    }

    requireStrictSingleLine(pattern['description'], `${patternPath}.description`, issues);

    if (pattern['notes'] !== undefined) {
      requireStrictText(pattern['notes'], `${patternPath}.notes`, issues);
    }
  });

  rejectDuplicateStrings(patternIds, path, issues);
  return hasPositiveSupport;
};

const validateProviderLimitValue = (
  kind: IProviderLimitKind,
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  if (kind === 'max-unicode-scalars' || kind === 'max-utf8-bytes') {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      addIssue(issues, path, 'Expected a positive safe integer.');
    }
    return;
  }

  if (kind === 'pattern') {
    requireStrictSingleLine(value, path, issues);
    return;
  }

  if (kind === 'allowed-values') {
    const values = requireArray(value, path, issues);

    if (values === null) {
      return;
    }

    if (values.length === 0) {
      addIssue(issues, path, 'Expected at least one allowed value.');
    }

    const validValues: string[] = [];
    values.forEach((allowedValue, index) => {
      if (requireStrictSingleLine(allowedValue, `${path}[${index}]`, issues)) {
        validValues.push(allowedValue);
      }
    });
    rejectDuplicateStrings(validValues, path, issues);
    return;
  }

  if (
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && isStrictSingleLine(value))
  ) {
    return;
  }

  addIssue(issues, path, 'Expected a finite number, boolean, or strict single-line string.');
};

const validateProviderLimits = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): boolean => {
  const limits = requireArray(value, path, issues);

  if (limits === null) {
    return false;
  }

  if (limits.length === 0) {
    addIssue(issues, path, 'Expected a non-empty array when provider limits are present.');
  }

  const limitIds: string[] = [];

  limits.forEach((value, index) => {
    const limitPath = `${path}[${index}]`;
    const limit = requireRecord(value, limitPath, issues);

    if (limit === null) {
      return;
    }

    rejectUnknownProperties(limit, PROVIDER_LIMIT_PROPERTIES, limitPath, issues);

    if (requireStableId(limit['id'], `${limitPath}.id`, issues)) {
      limitIds.push(limit['id']);
    }

    requireEnum(limit['subject'], PROVIDER_LIMIT_SUBJECTS, `${limitPath}.subject`, issues);
    const limitKind = limit['kind'];
    const hasKind = requireEnum(limitKind, PROVIDER_LIMIT_KINDS, `${limitPath}.kind`, issues);

    if (hasKind) {
      validateProviderLimitValue(limitKind, limit['value'], `${limitPath}.value`, issues);
    }

    requireStrictSingleLine(limit['description'], `${limitPath}.description`, issues);

    if (limit['reference'] !== undefined) {
      requireStrictSingleLine(limit['reference'], `${limitPath}.reference`, issues);
    }
  });

  rejectDuplicateStrings(limitIds, path, issues);
  return limits.length > 0;
};

const validateKnownLimitations = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const limitations = requireArray(value, path, issues);

  if (limitations === null) {
    return;
  }

  if (limitations.length === 0) {
    addIssue(issues, path, 'Expected a non-empty array when known limitations are present.');
  }

  const validLimitations: string[] = [];
  limitations.forEach((limitation, index) => {
    if (requireStrictText(limitation, `${path}[${index}]`, issues)) {
      validLimitations.push(limitation);

      if (limitation === 'some cases may not work') {
        addIssue(
          issues,
          `${path}[${index}]`,
          'Known limitations must describe an actionable boundary.',
        );
      }
    }
  });
  rejectDuplicateStrings(validLimitations, path, issues);
};

const validateTarget = (
  adapterId: string,
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): string | null => {
  const target = requireRecord(value, path, issues);

  if (target === null) {
    return null;
  }

  rejectUnknownProperties(target, TARGET_PROPERTIES, path, issues);
  const hasId = requireStableId(target['id'], `${path}.id`, issues);
  const hasKind = requireEnum(target['kind'], RUNTIME_TARGET_KINDS, `${path}.kind`, issues);
  requireEnum(
    target['supportLevel'],
    RUNTIME_TARGET_SUPPORT_LEVELS,
    `${path}.supportLevel`,
    issues,
  );
  const hasLanguage = requireStableId(target['language'], `${path}.language`, issues);
  const hasDate = requireDate(target['lastVerifiedAt'], `${path}.lastVerifiedAt`, issues);

  if (hasKind && target['kind'] === 'package') {
    validatePackageRequirements(target['packages'], `${path}.packages`, issues);

    if (adapterId === 'custom') {
      addIssue(issues, `${path}.kind`, 'The custom adapter may contain only a custom target.');
    }
  } else if (hasKind) {
    if (adapterId !== 'custom') {
      addIssue(issues, `${path}.kind`, 'A custom target is allowed only under the custom adapter.');
    }

    if (target['packages'] !== undefined) {
      addIssue(issues, `${path}.packages`, 'A custom target must omit package requirements.');
    }

    if (hasId && target['id'] !== 'custom') {
      addIssue(issues, `${path}.id`, 'A custom target must use ID custom.');
    }

    if (hasLanguage && target['language'] !== 'any') {
      addIssue(issues, `${path}.language`, 'A custom target must use language any.');
    }
  }

  if (hasLanguage && target['language'] === 'any' && target['kind'] !== 'custom') {
    addIssue(issues, `${path}.language`, 'Language any is allowed only for a custom target.');
  }

  let hasPositiveCapability = false;

  if (target['evidenceKinds'] !== undefined) {
    const evidenceKinds = validateStringArray(
      target['evidenceKinds'],
      EVIDENCE_KINDS,
      `${path}.evidenceKinds`,
      issues,
    );
    hasPositiveCapability ||= (evidenceKinds?.length ?? 0) > 0;
  }

  if (target['bindingSupport'] !== undefined) {
    const hasPositiveBindingSupport = validateBindingSupport(
      target['bindingSupport'],
      `${path}.bindingSupport`,
      issues,
    );
    hasPositiveCapability = hasPositiveCapability || hasPositiveBindingSupport;
  }

  if (target['patterns'] !== undefined) {
    const hasPositivePattern = validatePatterns(target['patterns'], `${path}.patterns`, issues);
    hasPositiveCapability = hasPositiveCapability || hasPositivePattern;
  }

  if (target['providerLimits'] !== undefined) {
    const hasProviderLimit = validateProviderLimits(
      target['providerLimits'],
      `${path}.providerLimits`,
      issues,
    );
    hasPositiveCapability = hasPositiveCapability || hasProviderLimit;
  }

  if (target['knownLimitations'] !== undefined) {
    validateKnownLimitations(target['knownLimitations'], `${path}.knownLimitations`, issues);
  }

  if (!hasPositiveCapability) {
    addIssue(issues, path, 'A target must publish at least one positive deterministic capability.');
  }

  return hasDate ? (target['lastVerifiedAt'] as string) : null;
};

const validateTargets = (
  adapterId: string,
  value: unknown,
  status: IAdapterImplementationStatus,
  adapterLastVerifiedAt: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const targets = requireArray(value, path, issues);

  if (targets === null) {
    return;
  }

  if (targets.length === 0) {
    addIssue(issues, path, 'Available and deprecated adapters require at least one target.');
  }

  const targetIds: string[] = [];
  const targetDates: string[] = [];
  let hasCurrentTarget = false;

  targets.forEach((targetValue, index) => {
    const targetPath = `${path}[${index}]`;
    const targetDate = validateTarget(adapterId, targetValue, targetPath, issues);

    if (isRecord(targetValue)) {
      if (typeof targetValue['id'] === 'string' && isStableId(targetValue['id'])) {
        targetIds.push(targetValue['id']);
      }

      if (
        targetValue['supportLevel'] === 'experimental' ||
        targetValue['supportLevel'] === 'supported'
      ) {
        hasCurrentTarget = true;
      }

      if (status === 'deprecated' && targetValue['supportLevel'] !== 'deprecated') {
        addIssue(
          issues,
          `${targetPath}.supportLevel`,
          'Every deprecated adapter target must be deprecated.',
        );
      }
    }

    if (targetDate !== null) {
      targetDates.push(targetDate);
    }
  });

  rejectDuplicateStrings(targetIds, path, issues);

  if (status === 'available' && !hasCurrentTarget) {
    addIssue(issues, path, 'An available adapter needs an experimental or supported target.');
  }

  if (adapterId === 'custom' && status === 'available') {
    const customTarget = targets[0];

    if (targets.length !== 1) {
      addIssue(issues, path, 'An available custom adapter must have exactly one target.');
    }

    if (!isRecord(customTarget) || customTarget['supportLevel'] !== 'supported') {
      addIssue(issues, `${path}[0].supportLevel`, 'The available custom target must be supported.');
    }
  }

  if (typeof adapterLastVerifiedAt === 'string' && isUtcCalendarDate(adapterLastVerifiedAt)) {
    for (const targetDate of targetDates) {
      if (adapterLastVerifiedAt < targetDate) {
        addIssue(
          issues,
          path,
          'Adapter lastVerifiedAt must not be earlier than any target verification date.',
        );
        break;
      }
    }
  }
};

const validateRepositoryFormatVersions = (
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const versions = requireArray(value, path, issues);

  if (versions === null) {
    return;
  }

  if (versions.length === 0) {
    addIssue(issues, path, 'Expected at least one repository-format version.');
  }

  const seenVersions = new Set<number>();
  versions.forEach((version, index) => {
    if (!Number.isSafeInteger(version) || (version as number) <= 0) {
      addIssue(issues, `${path}[${index}]`, 'Expected a positive safe integer.');
    } else if (seenVersions.has(version as number)) {
      addIssue(issues, `${path}[${index}]`, `Duplicate version: ${String(version)}.`);
    } else {
      seenVersions.add(version as number);
    }
  });
};

const validateAdapterState = (
  adapterId: string,
  adapter: Record<string, unknown>,
  implementation: Record<string, unknown> | null,
  status: IAdapterImplementationStatus,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const isPublished = status === 'available' || status === 'deprecated';

  if (!isPublished) {
    if (implementation?.['versionRange'] !== undefined) {
      addIssue(
        issues,
        `${path}.implementation.versionRange`,
        'Unpublished adapters must omit versionRange.',
      );
    }

    for (const fieldName of SUPPORT_FIELD_NAMES) {
      if (adapter[fieldName] !== undefined) {
        addIssue(issues, `${path}.${fieldName}`, `${status} adapters must omit support fields.`);
      }
    }
  } else {
    for (const fieldName of SUPPORT_FIELD_NAMES) {
      if (adapter[fieldName] === undefined) {
        addIssue(issues, `${path}.${fieldName}`, `${status} adapters require this support field.`);
      }
    }

    if (implementation?.['kind'] === 'package') {
      requireSemverRange(
        implementation['versionRange'],
        `${path}.implementation.versionRange`,
        issues,
      );
    } else if (implementation?.['versionRange'] !== undefined) {
      addIssue(
        issues,
        `${path}.implementation.versionRange`,
        'Built-in adapters must omit versionRange.',
      );
    }

    if (adapter['supportedRepositoryFormatVersions'] !== undefined) {
      validateRepositoryFormatVersions(
        adapter['supportedRepositoryFormatVersions'],
        `${path}.supportedRepositoryFormatVersions`,
        issues,
      );
    }

    if (adapter['compatibleCoreRange'] !== undefined) {
      requireSemverRange(adapter['compatibleCoreRange'], `${path}.compatibleCoreRange`, issues);
    }

    if (adapter['runtimeGuidance'] !== undefined) {
      validateRuntimeGuidance(adapter['runtimeGuidance'], `${path}.runtimeGuidance`, issues);
    }

    if (adapter['lastVerifiedAt'] !== undefined) {
      requireDate(adapter['lastVerifiedAt'], `${path}.lastVerifiedAt`, issues);
    }

    if (adapter['targets'] !== undefined) {
      validateTargets(
        adapterId,
        adapter['targets'],
        status,
        adapter['lastVerifiedAt'],
        `${path}.targets`,
        issues,
      );
    }
  }

  if (status === 'deprecated') {
    if (adapterId === 'custom') {
      addIssue(issues, `${path}.implementationStatus`, 'The custom adapter cannot be deprecated.');
    }
  } else if (adapter['replacement'] !== undefined) {
    addIssue(issues, `${path}.replacement`, 'Replacement is allowed only for deprecated adapters.');
  }
};

const validateAdapter = (
  adapterId: string,
  value: unknown,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  const adapter = requireRecord(value, path, issues);

  if (adapter === null) {
    return;
  }

  rejectUnknownProperties(adapter, ADAPTER_PROPERTIES, path, issues);
  const implementation = validateImplementation(
    adapterId,
    adapter['implementation'],
    `${path}.implementation`,
    issues,
  );
  const hasStatus = requireEnum(
    adapter['implementationStatus'],
    ADAPTER_IMPLEMENTATION_STATUSES,
    `${path}.implementationStatus`,
    issues,
  );

  if (adapter['notes'] !== undefined) {
    requireStrictText(adapter['notes'], `${path}.notes`, issues);
  }

  if (adapter['replacement'] !== undefined) {
    requireStableId(adapter['replacement'], `${path}.replacement`, issues);
  }

  if (hasStatus) {
    const implementationStatus = adapter['implementationStatus'] as IAdapterImplementationStatus;
    validateAdapterState(adapterId, adapter, implementation, implementationStatus, path, issues);
  }
};

const validateReplacements = (
  adapters: Record<string, unknown>,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  for (const [adapterId, adapterValue] of Object.entries(adapters)) {
    if (!isRecord(adapterValue) || typeof adapterValue['replacement'] !== 'string') {
      continue;
    }

    const replacementId = adapterValue['replacement'];
    const replacement = adapters[replacementId];
    const path = `$.adapters.${adapterId}.replacement`;

    if (replacementId === adapterId) {
      addIssue(issues, path, 'A deprecated adapter cannot replace itself.');
    } else if (!isRecord(replacement) || replacement['implementationStatus'] !== 'available') {
      addIssue(issues, path, 'Replacement must identify an available adapter.');
    }
  }
};

const inspectYamlNode = (
  node: Node | null,
  path: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): void => {
  if (node === null) {
    addIssue(issues, path, 'Explicit or implicit null values are prohibited.');
    return;
  }

  if (isAlias(node)) {
    addIssue(issues, path, 'YAML aliases are prohibited.');
    return;
  }

  if ('anchor' in node && typeof node.anchor === 'string') {
    addIssue(issues, path, 'YAML anchors are prohibited.');
  }

  if (node.tag !== undefined && !node.tag.startsWith('tag:yaml.org,2002:')) {
    addIssue(issues, path, 'Custom YAML tags are prohibited.');
  }

  if (isScalar(node)) {
    if (node.value === null) {
      addIssue(issues, path, 'Explicit null values are prohibited.');
    } else if (typeof node.value === 'number' && !Number.isFinite(node.value)) {
      addIssue(issues, path, 'Non-finite numeric values are prohibited.');
    }
    return;
  }

  if (isSeq(node)) {
    node.items.forEach((item, index) =>
      inspectYamlNode(item as Node | null, `${path}[${index}]`, issues),
    );
    return;
  }

  if (isMap(node)) {
    node.items.forEach((pair, index) => {
      if (isScalar(pair.key) && pair.key.value === '<<' && pair.key.type === 'PLAIN') {
        addIssue(issues, `${path}[${index}]`, 'YAML merge keys are prohibited.');
      }

      inspectYamlNode(pair.key as Node | null, `${path}[${index}].key`, issues);
      inspectYamlNode(pair.value as Node | null, `${path}[${index}].value`, issues);
    });
  }
};

const parseYamlDocument = (
  source: string,
  issues: IRuntimeCompatibilityValidationIssue[],
): Document.Parsed<ParsedNode> | null => {
  if (/^%/mu.test(source)) {
    addIssue(issues, '$', 'YAML directives are prohibited.');
  }

  const documents = parseAllDocuments(source, {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });

  if (documents.length !== 1) {
    addIssue(issues, '$', 'Expected exactly one YAML document.');
    return null;
  }

  const document = documents[0];

  if (document === undefined) {
    addIssue(issues, '$', 'Expected one YAML document.');
    return null;
  }

  if (
    document.directives.yaml.explicit ||
    Object.keys(document.directives.tags).some((tagHandle) => tagHandle !== '!!')
  ) {
    addIssue(issues, '$', 'YAML directives are prohibited.');
  }

  for (const error of document.errors) {
    addIssue(issues, '$', error.message);
  }

  for (const warning of document.warnings) {
    addIssue(issues, '$', warning.message);
  }

  inspectYamlNode(document.contents, '$', issues);
  return document;
};

/** Parses, validates, and deterministically normalizes the canonical runtime matrix. */
export const parseRuntimeCompatibilityMatrix = (
  source: string,
): IRuntimeCompatibilityValidationResult => {
  const issues: IRuntimeCompatibilityValidationIssue[] = [];
  const document = parseYamlDocument(source, issues);

  if (document === null || issues.length > 0) {
    return { issues, valid: false };
  }

  const rootValue: unknown = document.toJS({ maxAliasCount: 0 });
  const root = requireRecord(rootValue, '$', issues);

  if (root === null) {
    return { issues, valid: false };
  }

  rejectUnknownProperties(root, TOP_LEVEL_PROPERTIES, '$', issues);

  if (root['version'] !== 1) {
    addIssue(issues, '$.version', 'Matrix version must be the integer 1.');
  }

  const adapters = requireRecord(root['adapters'], '$.adapters', issues);

  if (adapters !== null) {
    const adapterIds = Object.keys(adapters);

    if (adapterIds.length === 0) {
      addIssue(issues, '$.adapters', 'The adapter mapping must be non-empty.');
    }

    const expectedAdapterIds = Object.keys(OFFICIAL_RUNTIME_ADAPTER_PACKAGES).sort(
      compareExactStrings,
    );
    const actualAdapterIds = [...adapterIds].sort(compareExactStrings);

    if (JSON.stringify(actualAdapterIds) !== JSON.stringify(expectedAdapterIds)) {
      addIssue(
        issues,
        '$.adapters',
        `Expected the complete official adapter set: ${expectedAdapterIds.join(', ')}.`,
      );
    }

    for (const adapterId of actualAdapterIds) {
      if (!isStableId(adapterId)) {
        addIssue(issues, `$.adapters.${adapterId}`, 'Adapter key must satisfy stable-ID rules.');
      }

      validateAdapter(adapterId, adapters[adapterId], `$.adapters.${adapterId}`, issues);
    }

    validateReplacements(adapters, issues);
  }

  if (issues.length > 0) {
    return { issues, valid: false };
  }

  return {
    matrix: normalizeRuntimeCompatibilityMatrix(root as unknown as IRuntimeCompatibilityMatrix),
    valid: true,
  };
};
