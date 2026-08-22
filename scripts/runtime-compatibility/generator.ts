import { format } from 'prettier';

import { BINDING_SUBJECTS } from './constants.ts';
import type {
  IBindingSupport,
  IProviderLimit,
  IRuntimeAdapterEntry,
  IRuntimeCompatibilityMatrix,
  IRuntimePattern,
  IRuntimeTarget,
} from './types.ts';

const GENERATED_WARNING =
  '> **Generated file. Do not edit directly. Canonical source: `/compatibility/runtimes.yaml`.**';
const MISSING_VALUE = 'Not available';

const formatInlineCode = (value: string): string => {
  const delimiter = value.includes('`') ? '``' : '`';
  return `${delimiter}${value}${delimiter}`;
};

const escapeTableText = (value: string): string =>
  value.replaceAll('|', '\\|').replaceAll('\n', '<br>');

const formatTableInlineCode = (value: string): string => {
  return escapeTableText(formatInlineCode(value));
};

const formatOptionalCode = (value: string | undefined): string => {
  return value === undefined ? MISSING_VALUE : formatInlineCode(value);
};

const formatOptionalTableCode = (value: string | undefined): string => {
  return value === undefined ? MISSING_VALUE : formatTableInlineCode(value);
};

const formatProviderLimitValue = (limit: IProviderLimit): string => {
  if (Array.isArray(limit.value)) {
    return limit.value.map(formatTableInlineCode).join(', ');
  }

  return formatTableInlineCode(String(limit.value));
};

const generateSummaryRow = (adapterId: string, adapter: IRuntimeAdapterEntry): string => {
  return [
    formatTableInlineCode(adapterId),
    formatTableInlineCode(adapter.implementation.package),
    formatTableInlineCode(adapter.implementation.kind),
    formatTableInlineCode(adapter.implementation.distribution),
    formatOptionalTableCode(adapter.implementation.versionRange),
    formatTableInlineCode(adapter.implementationStatus),
    formatOptionalTableCode(adapter.runtimeGuidance?.expectation),
    formatTableInlineCode(String(adapter.targets?.length ?? 0)),
  ].join(' | ');
};

const generatePackageRequirements = (target: IRuntimeTarget): string[] => {
  if (target.packages === undefined) {
    return [];
  }

  return [
    '| Ecosystem | Package | Role | Verified range |',
    '| --- | --- | --- | --- |',
    ...target.packages.map((requirement) => {
      return `| ${formatTableInlineCode(requirement.ecosystem)} | ${formatTableInlineCode(requirement.name)} | ${formatTableInlineCode(requirement.role)} | ${formatTableInlineCode(requirement.versionRange)} |`;
    }),
    '',
  ];
};

const generateBindingSupport = (target: IRuntimeTarget): string[] => {
  if (target.bindingSupport === undefined) {
    return [];
  }

  const rows = BINDING_SUBJECTS.flatMap((subject) => {
    const support: IBindingSupport | undefined = target.bindingSupport?.[subject];
    return support === undefined
      ? []
      : [
          `| ${formatTableInlineCode(subject)} | ${formatTableInlineCode(support.relationship)} | ${formatTableInlineCode(support.symbol)} |`,
        ];
  });

  return [
    '#### Binding support',
    '',
    '| Subject | Relationship | Symbol |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ];
};

const generatePatterns = (patterns: IRuntimePattern[] | undefined): string[] => {
  if (patterns === undefined) {
    return [];
  }

  return [
    '#### Patterns',
    '',
    '| Kind | Pattern | Support | Description | Notes |',
    '| --- | --- | --- | --- | --- |',
    ...patterns.map((pattern) => {
      return `| ${formatTableInlineCode(pattern.kind)} | ${formatTableInlineCode(pattern.id)} | ${formatTableInlineCode(pattern.support)} | ${escapeTableText(pattern.description)} | ${pattern.notes === undefined ? MISSING_VALUE : escapeTableText(pattern.notes)} |`;
    }),
    '',
  ];
};

const generateProviderLimits = (limits: IProviderLimit[] | undefined): string[] => {
  if (limits === undefined) {
    return [];
  }

  return [
    '#### Provider limits',
    '',
    '| Subject | Limit | Kind | Value | Description | Reference |',
    '| --- | --- | --- | --- | --- | --- |',
    ...limits.map((limit) => {
      return `| ${formatTableInlineCode(limit.subject)} | ${formatTableInlineCode(limit.id)} | ${formatTableInlineCode(limit.kind)} | ${formatProviderLimitValue(limit)} | ${escapeTableText(limit.description)} | ${limit.reference === undefined ? MISSING_VALUE : escapeTableText(limit.reference)} |`;
    }),
    '',
  ];
};

const generateTarget = (target: IRuntimeTarget): string[] => {
  return [
    `### Target: ${formatInlineCode(target.id)}`,
    '',
    `- Kind: ${formatInlineCode(target.kind)}`,
    `- Language: ${formatInlineCode(target.language)}`,
    `- Evidence kinds: ${target.evidenceKinds?.map(formatInlineCode).join(', ') ?? MISSING_VALUE}`,
    `- Last verified: ${formatInlineCode(target.lastVerifiedAt)}`,
    ...(target.qualificationEvidence === undefined
      ? []
      : [
          `- Qualification evidence: [View profile and results](${target.qualificationEvidence.url})`,
        ]),
    '',
    ...generatePackageRequirements(target),
    ...generateBindingSupport(target),
    ...generatePatterns(target.patterns),
    ...generateProviderLimits(target.providerLimits),
    ...(target.knownLimitations === undefined
      ? []
      : [
          '#### Known limitations',
          '',
          ...target.knownLimitations.map((limitation) => `- ${limitation}`),
          '',
        ]),
  ];
};

const generatePublishedAdapter = (adapterId: string, adapter: IRuntimeAdapterEntry): string[] => {
  if (adapter.targets === undefined) {
    return [];
  }

  return [
    `## Adapter: ${formatInlineCode(adapterId)}`,
    '',
    `- Owning package: ${formatInlineCode(adapter.implementation.package)}`,
    `- Implementation range: ${formatOptionalCode(adapter.implementation.versionRange)}`,
    `- Supported repository-format versions: ${adapter.supportedRepositoryFormatVersions?.map(String).map(formatInlineCode).join(', ') ?? MISSING_VALUE}`,
    `- Compatible Core range: ${formatOptionalCode(adapter.compatibleCoreRange)}`,
    `- Runtime guidance: ${formatOptionalCode(adapter.runtimeGuidance?.expectation)}`,
    `- Last verified: ${formatOptionalCode(adapter.lastVerifiedAt)}`,
    ...(adapter.replacement === undefined
      ? []
      : [`- Replacement: ${formatInlineCode(adapter.replacement)}`]),
    '',
    ...(adapter.runtimeGuidance?.notes === undefined
      ? []
      : [`Runtime guidance notes: ${adapter.runtimeGuidance.notes}`, '']),
    ...(adapter.notes === undefined ? [] : [adapter.notes, '']),
    ...adapter.targets.flatMap(generateTarget),
  ];
};

/** Generates the formatted deterministic public Markdown presentation for a validated matrix. */
export const generateRuntimeCompatibilityMarkdown = async (
  matrix: IRuntimeCompatibilityMatrix,
): Promise<string> => {
  const adapters = Object.entries(matrix.adapters);
  const hasPublishedAdapter = adapters.some(
    ([, adapter]) =>
      adapter.implementationStatus === 'available' || adapter.implementationStatus === 'deprecated',
  );
  const lines = [
    GENERATED_WARNING,
    '',
    `Matrix format version: ${formatInlineCode(String(matrix.version))}`,
    '',
    hasPublishedAdapter
      ? 'The matrix publishes only the verified targets and support boundaries shown below.'
      : 'The initial matrix records the approved adapter inventory only. Every adapter is currently `planned`, so this document makes no runtime package, language, version, runtime-guidance, evidence, validation, pattern, or provider-limit compatibility claim.',
    '',
    '| Adapter ID | Owning package | Implementation | Distribution | Implementation range | Status | Runtime guidance | Verified targets |',
    '| --- | --- | --- | --- | --- | --- | --- | ---: |',
    ...adapters.map(([adapterId, adapter]) => `| ${generateSummaryRow(adapterId, adapter)} |`),
    '',
    ...adapters.flatMap(([adapterId, adapter]) =>
      adapter.implementationStatus === 'available' || adapter.implementationStatus === 'deprecated'
        ? generatePublishedAdapter(adapterId, adapter)
        : [],
    ),
    ...(hasPublishedAdapter
      ? []
      : [
          'Compatibility targets will be added only after the corresponding adapter implementation and conformance fixtures verify the exact support claim.',
          '',
        ]),
  ];

  const markdown = `${lines
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd()}\n`;

  return format(markdown, {
    endOfLine: 'lf',
    parser: 'markdown',
    printWidth: 100,
    proseWrap: 'preserve',
  });
};
