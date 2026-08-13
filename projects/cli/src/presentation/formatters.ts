import type { IDiagnostic, IDiagnosticEntity } from '@moldea.ai/core';

import { MOLDEA_CLI_COMMANDS, type IMoldeaCliCommand } from '../command-line/index.js';
import type {
  IMoldeaCliAdapterCompatibility,
  IMoldeaCliCompatibilityResult,
} from '../compatibility/index.js';
import { MOLDEA_CLI_JSON_SCHEMA_VERSION } from '../json-output-contract/index.js';
import { serializeJsonDeterministically } from '../json-serialization/index.js';

import { MOLDEA_CLI_COMMAND_HELP, MOLDEA_CLI_TOP_LEVEL_HELP } from './constants.js';
import type {
  IMoldeaCliError,
  IMoldeaCliInspectResult,
  IMoldeaCliJsonCompatibilityEnvelope,
  IMoldeaCliJsonErrorEnvelope,
  IMoldeaCliJsonInspectEnvelope,
  IMoldeaCliJsonValidateEnvelope,
  IMoldeaCliValidateResult,
} from './types.js';

const DIAGNOSTIC_ENTITY_KEYS = [
  'agentId',
  'capabilityKind',
  'capabilityId',
  'decisionId',
  'variableId',
  'adapterId',
] as const satisfies readonly (keyof IDiagnosticEntity)[];

/** Formats one diagnostic entity in the canonical Core field order. */
const formatMoldeaCliHumanDiagnosticEntity = (entity: IDiagnosticEntity): string =>
  DIAGNOSTIC_ENTITY_KEYS.flatMap((key) => {
    const identifier = entity[key];

    return identifier === undefined ? [] : [`${key}=${identifier}`];
  }).join(', ');

/** Formats one Core or adapter diagnostic without changing its order or meaning. */
const formatMoldeaCliHumanDiagnostic = (diagnostic: IDiagnostic): string => {
  const location =
    diagnostic.path === null
      ? ''
      : diagnostic.range === null
        ? ` ${diagnostic.path}`
        : ` ${diagnostic.path}:${diagnostic.range.start.line}:${diagnostic.range.start.column}`;
  const lines = [`${diagnostic.source}:${diagnostic.code}${location} ${diagnostic.message}`];

  if (diagnostic.pointer !== null) {
    lines.push(`  pointer: ${diagnostic.pointer}`);
  }

  if (diagnostic.entity !== null) {
    lines.push(`  entity: ${formatMoldeaCliHumanDiagnosticEntity(diagnostic.entity)}`);
  }

  return lines.join('\n');
};

/** Creates the shared human summary lines for one completed inspection state. */
const createMoldeaCliHumanStatusLines = (
  isValid: boolean,
  formatVersion: IMoldeaCliValidateResult['formatVersion'],
): string[] => {
  const lines = [`The moldea project is ${isValid ? 'valid' : 'invalid'}.`];

  if (formatVersion !== null) {
    lines.push(`Repository format: ${formatVersion}`);
  }

  return lines;
};

/** Appends Core diagnostics and their final count without changing supplied order. */
const appendMoldeaCliHumanDiagnostics = (
  lines: string[],
  diagnostics: readonly IDiagnostic[],
): void => {
  for (const diagnostic of diagnostics) {
    lines.push(formatMoldeaCliHumanDiagnostic(diagnostic));
  }

  const diagnosticLabel = diagnostics.length === 1 ? 'diagnostic' : 'diagnostics';

  lines.push(`${diagnostics.length} ${diagnosticLabel}.`);
};

/** Formats one count label with correct singular or plural grammar. */
const formatMoldeaCliHumanCount = (
  count: number,
  singularLabel: string,
  pluralLabel: string,
): string => `${count === 1 ? singularLabel : pluralLabel}: ${count}`;

/** Formats optional published matrix details for one human adapter record. */
const formatMoldeaCliHumanAdapterDetails = (
  adapter: IMoldeaCliAdapterCompatibility,
): readonly string[] => {
  const { matrix } = adapter;
  const lines: string[] = [];

  if (matrix.implementation.versionRange !== undefined) {
    lines.push(`    Implementation range: ${matrix.implementation.versionRange}`);
  }

  if (matrix.compatibleCoreRange !== undefined) {
    lines.push(`    Compatible Core range: ${matrix.compatibleCoreRange}`);
  }

  if (matrix.supportedRepositoryFormatVersions !== undefined) {
    lines.push(`    Repository formats: ${matrix.supportedRepositoryFormatVersions.join(', ')}`);
  }

  if (matrix.runtimeGuidance !== undefined) {
    lines.push(`    Runtime guidance: ${matrix.runtimeGuidance.expectation}`);

    if (matrix.runtimeGuidance.notes !== undefined) {
      lines.push(`    Runtime guidance notes: ${matrix.runtimeGuidance.notes}`);
    }
  }

  if (matrix.lastVerifiedAt !== undefined) {
    lines.push(`    Last verified: ${matrix.lastVerifiedAt}`);
  }

  for (const target of matrix.targets ?? []) {
    lines.push(
      `    Target ${target.id}: kind=${target.kind}, language=${target.language}, support=${target.supportLevel}, verified=${target.lastVerifiedAt}`,
    );
  }

  return lines;
};

/**
 * Formats top-level or command-specific help with its required trailing line feed.
 * @param command The resolved command, or null for top-level help.
 * @returns Human-readable help text.
 */
export const formatMoldeaCliHelp = (command: IMoldeaCliCommand | null): string => {
  if (command === null) {
    return MOLDEA_CLI_TOP_LEVEL_HELP;
  }

  return MOLDEA_CLI_COMMAND_HELP[command];
};

/**
 * Formats one safe CLI error for human stderr output.
 * @param error The complete safe operational error.
 * @returns One concise line ending with LF.
 */
export const formatMoldeaCliHumanError = (error: IMoldeaCliError): string =>
  `${error.source}:${error.code} ${error.message}\n`;

/**
 * Formats one safe version 1 JSON error envelope.
 * @param error The complete safe operational error.
 * @param command The resolved command, or null when resolution failed.
 * @param cliVersion The installed CLI package version.
 * @returns One compact deterministic JSON document ending with LF.
 */
export const formatMoldeaCliJsonError = (
  error: IMoldeaCliError,
  command: IMoldeaCliCommand | null,
  cliVersion: string,
): string => {
  const envelope: IMoldeaCliJsonErrorEnvelope = {
    cliVersion,
    command,
    error,
    result: null,
    schemaVersion: MOLDEA_CLI_JSON_SCHEMA_VERSION,
    status: 'error',
  };

  return `${serializeJsonDeterministically(envelope)}\n`;
};

/**
 * Formats one valid compatibility result for human stdout.
 * @param result The exact installed compatibility composition.
 * @param cliVersion The installed CLI package version.
 * @returns A deterministic complete human report ending with LF.
 */
export const formatMoldeaCliHumanCompatibilityResult = (
  result: IMoldeaCliCompatibilityResult,
  cliVersion: string,
): string => {
  const lines = [
    'The installed CLI compatibility state is valid.',
    `CLI version: ${cliVersion}`,
    `Supported Node.js: ${result.supportedNodeRange}`,
    `JSON output schema: ${result.outputSchemaVersion}`,
    `Runtime compatibility matrix: ${result.matrixVersion}`,
    `Minimum Git: ${result.minimumGitVersion}`,
    `Repository formats: ${result.repositoryFormatVersions.join(', ')}`,
    'Packages:',
    ...result.packages.map(({ name, version }) => `  ${name}: ${version}`),
    'Adapters:',
  ];

  for (const adapter of result.adapters) {
    lines.push(
      `  ${adapter.id}: active=${adapter.active ? 'yes' : 'no'}, bundled=${adapter.bundledVersion ?? 'none'}, kind=${adapter.matrix.implementation.kind}, package=${adapter.matrix.implementation.package}, status=${adapter.matrix.implementationStatus}`,
      ...formatMoldeaCliHumanAdapterDetails(adapter),
    );
  }

  return `${lines.join('\n')}\n`;
};

/**
 * Formats one valid compatibility result as a version 1 JSON envelope.
 * @param result The exact installed compatibility composition.
 * @param cliVersion The installed CLI package version.
 * @returns One compact deterministic JSON document ending with LF.
 */
export const formatMoldeaCliJsonCompatibilityResult = (
  result: IMoldeaCliCompatibilityResult,
  cliVersion: string,
): string => {
  const envelope: IMoldeaCliJsonCompatibilityEnvelope = {
    cliVersion,
    command: MOLDEA_CLI_COMMANDS.Compatibility,
    error: null,
    result,
    schemaVersion: MOLDEA_CLI_JSON_SCHEMA_VERSION,
    status: 'valid',
  };

  return `${serializeJsonDeterministically(envelope)}\n`;
};

/**
 * Formats one completed validation result for human stdout.
 * @param result The content-minimized validation result.
 * @returns A deterministic summary and diagnostics ending with LF.
 */
export const formatMoldeaCliHumanValidateResult = (result: IMoldeaCliValidateResult): string => {
  const isValid = result.diagnostics.length === 0;
  const lines = createMoldeaCliHumanStatusLines(isValid, result.formatVersion);

  if (!isValid) {
    appendMoldeaCliHumanDiagnostics(lines, result.diagnostics);
  }

  return `${lines.join('\n')}\n`;
};

/**
 * Formats one completed validation result as a version 1 JSON envelope.
 * @param result The content-minimized validation result.
 * @param cliVersion The installed CLI package version.
 * @returns One compact deterministic JSON document ending with LF.
 */
export const formatMoldeaCliJsonValidateResult = (
  result: IMoldeaCliValidateResult,
  cliVersion: string,
): string => {
  const envelope: IMoldeaCliJsonValidateEnvelope = {
    cliVersion,
    command: MOLDEA_CLI_COMMANDS.Validate,
    error: null,
    result,
    schemaVersion: MOLDEA_CLI_JSON_SCHEMA_VERSION,
    status: result.diagnostics.length === 0 ? 'valid' : 'invalid',
  };

  return `${serializeJsonDeterministically(envelope)}\n`;
};

/**
 * Formats one completed inspection result for human stdout.
 * @param result The complete inspection result and its source descriptor.
 * @returns A deterministic content-free summary or diagnostic report ending with LF.
 * @throws If a Core-valid result does not include its complete project index.
 */
export const formatMoldeaCliHumanInspectResult = (result: IMoldeaCliInspectResult): string => {
  const { inspection } = result;
  const lines = createMoldeaCliHumanStatusLines(inspection.valid, inspection.formatVersion);

  if (!inspection.valid) {
    if (inspection.evidence.length > 0) {
      lines.push(
        formatMoldeaCliHumanCount(
          inspection.evidence.length,
          'Adapter evidence item',
          'Adapter evidence items',
        ),
      );
    }

    appendMoldeaCliHumanDiagnostics(lines, inspection.diagnostics);

    return `${lines.join('\n')}\n`;
  }

  if (inspection.project === null) {
    throw new TypeError('A valid Core inspection must include its project index.');
  }

  const mirrorCount = inspection.project.agents.reduce(
    (count, agent) => count + agent.mirrors.length,
    0,
  );

  lines.push(
    formatMoldeaCliHumanCount(inspection.project.context.length, 'Context asset', 'Context assets'),
    formatMoldeaCliHumanCount(inspection.project.decisions.length, 'Decision', 'Decisions'),
    formatMoldeaCliHumanCount(
      inspection.project.runtimes.length,
      'Runtime-guidance asset',
      'Runtime-guidance assets',
    ),
    formatMoldeaCliHumanCount(inspection.project.agents.length, 'Agent', 'Agents'),
    formatMoldeaCliHumanCount(mirrorCount, 'Mirror', 'Mirrors'),
    formatMoldeaCliHumanCount(
      inspection.evidence.length,
      'Adapter evidence item',
      'Adapter evidence items',
    ),
  );

  return `${lines.join('\n')}\n`;
};

/**
 * Formats one completed inspection result as a version 1 JSON envelope.
 * @param result The complete inspection result and its source descriptor.
 * @param cliVersion The installed CLI package version.
 * @returns One compact deterministic JSON document ending with LF.
 */
export const formatMoldeaCliJsonInspectResult = (
  result: IMoldeaCliInspectResult,
  cliVersion: string,
): string => {
  const envelope: IMoldeaCliJsonInspectEnvelope = {
    cliVersion,
    command: MOLDEA_CLI_COMMANDS.Inspect,
    error: null,
    result,
    schemaVersion: MOLDEA_CLI_JSON_SCHEMA_VERSION,
    status: result.inspection.valid ? 'valid' : 'invalid',
  };

  return `${serializeJsonDeterministically(envelope)}\n`;
};
