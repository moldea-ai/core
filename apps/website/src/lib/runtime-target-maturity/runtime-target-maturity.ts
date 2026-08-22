import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import type { IRuntimeCompatibilityMatrix } from '../../../../../scripts/runtime-compatibility/types.ts';

import type { IRuntimeTargetMaturityRegistry } from './types.ts';

const RuntimeTargetMaturitySchema = z.enum(['deprecated', 'experimental', 'supported']);
const RuntimeTargetMaturityRegistrySchema = z.record(
  z.string().min(1),
  z
    .record(z.string().min(1), RuntimeTargetMaturitySchema)
    .refine(
      (targets) => Object.keys(targets).length > 0,
      'Adapter target mappings must not be empty.',
    ),
);
const RuntimeTargetMaturityDocumentSchema = z.strictObject({
  targets: RuntimeTargetMaturityRegistrySchema,
  version: z.literal(1),
});

const createTargetKey = (adapterId: string, targetId: string): string => `${adapterId}/${targetId}`;

/**
 * Parses website-owned maturity labels and requires an exact match with matrix targets.
 * @param source The YAML maturity document.
 * @param matrix The validated technical compatibility matrix.
 * @returns The validated maturity registry.
 * @throws
 * - If the maturity document is malformed, incomplete, or contains a stale target.
 */
export const parseRuntimeTargetMaturity = (
  source: string,
  matrix: IRuntimeCompatibilityMatrix,
): IRuntimeTargetMaturityRegistry => {
  const document = RuntimeTargetMaturityDocumentSchema.parse(parseYaml(source));
  const expectedTargetKeys = new Set(
    Object.entries(matrix.adapters).flatMap(([adapterId, adapter]) =>
      (adapter.targets ?? []).map((target) => createTargetKey(adapterId, target.id)),
    ),
  );
  const configuredTargetKeys = new Set(
    Object.entries(document.targets).flatMap(([adapterId, targets]) =>
      Object.keys(targets).map((targetId) => createTargetKey(adapterId, targetId)),
    ),
  );
  const missingTargetKeys = [...expectedTargetKeys]
    .filter((targetKey) => !configuredTargetKeys.has(targetKey))
    .sort();
  const staleTargetKeys = [...configuredTargetKeys]
    .filter((targetKey) => !expectedTargetKeys.has(targetKey))
    .sort();

  if (missingTargetKeys.length > 0 || staleTargetKeys.length > 0) {
    const details = [
      ...(missingTargetKeys.length > 0
        ? [`missing matrix targets: ${missingTargetKeys.join(', ')}`]
        : []),
      ...(staleTargetKeys.length > 0
        ? [`unknown or stale targets: ${staleTargetKeys.join(', ')}`]
        : []),
    ];

    throw new Error(`Runtime target maturity is inconsistent (${details.join('; ')}).`);
  }

  return document.targets;
};
