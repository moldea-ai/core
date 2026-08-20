import ts from 'typescript';

import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { ISkillManifestEntry } from '@moldea.ai/core/format';

import { EVE_ADAPTER_ID } from '../constants/index.js';
import type {
  IEveAgentDefinition,
  IEveDefinitionResult,
  IEveInspectionSession,
  IEveSkillCandidate,
  IEveSourceAnalysis,
} from '../contracts/index.js';
import {
  getEveDefinition,
  getEvePropertyExpression,
  isEveStaticStringRecord,
  resolveEveStaticString,
} from '../source-analysis/index.js';
import { addEveDiagnostic, addEveSourceFailureDiagnostic, createEveEvidence } from './common.js';

interface IPreparedSkill {
  readonly analysis: IEveSourceAnalysis;
  readonly candidate: IEveSkillCandidate;
  readonly definition: Extract<IEveDefinitionResult, { readonly kind: 'present-supported' }>;
  readonly isRegistrationEligible: boolean;
}

const ALLOWED_SKILL_KEYS = new Set(['description', 'files', 'license', 'markdown', 'metadata']);

const prepareSkill = async (
  session: IEveInspectionSession,
  candidate: IEveSkillCandidate,
): Promise<IPreparedSkill | null> => {
  if (candidate.kind !== 'typescript' || candidate.isCollidedSlot) {
    return null;
  }

  const result = await session.analyzeSource(candidate.path);

  if (result.kind !== 'valid') {
    return null;
  }

  const definition = getEveDefinition(result.analysis, 'skill');

  if (
    definition.kind !== 'present-supported' ||
    [...definition.properties].some(
      ([key, property]) => !ALLOWED_SKILL_KEYS.has(key) || !ts.isPropertyAssignment(property),
    )
  ) {
    return null;
  }

  const description = getEvePropertyExpression(definition.properties, 'description');
  const markdown = getEvePropertyExpression(definition.properties, 'markdown');
  const license = getEvePropertyExpression(definition.properties, 'license');
  const metadata = getEvePropertyExpression(definition.properties, 'metadata');
  const files = getEvePropertyExpression(definition.properties, 'files');
  const isRegistrationEligible =
    description !== null &&
    markdown !== null &&
    (await resolveEveStaticString(session, result.analysis, description)).kind === 'supported' &&
    (await resolveEveStaticString(session, result.analysis, markdown)).kind === 'supported' &&
    (license === null ||
      (await resolveEveStaticString(session, result.analysis, license)).kind === 'supported') &&
    (metadata === null || (await isEveStaticStringRecord(session, result.analysis, metadata))) &&
    (files === null || (await isEveStaticStringRecord(session, result.analysis, files)));

  return Object.freeze({
    analysis: result.analysis,
    candidate,
    definition,
    isRegistrationEligible,
  });
};

const selectSkill = (
  candidates: readonly IEveSkillCandidate[],
  skill: ISkillManifestEntry,
): IEveSkillCandidate | null => {
  const implementationMatches = candidates.filter(({ path }) => path === skill.implementation.path);

  if (implementationMatches.length === 1) {
    return implementationMatches[0] ?? null;
  }

  const nameMatches = candidates.filter(({ identity }) => identity === skill.name);
  return nameMatches.length === 1 ? (nameMatches[0] ?? null) : null;
};

/** Inspects flat, packaged, and TypeScript Eve skills for one scoped agent. */
export const inspectEveSkills = async (
  session: IEveInspectionSession,
  definition: IEveAgentDefinition,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<void> => {
  for (const [capabilityId, skill] of Object.entries(definition.agent.declaration.skills ?? {})) {
    const candidate = selectSkill(definition.rootIndex.skillCandidates, skill);

    if (candidate === null || candidate.isCollidedSlot) {
      continue;
    }

    const supportsImplementationSymbol =
      candidate.kind === 'typescript'
        ? skill.implementation.symbol === undefined || skill.implementation.symbol === 'default'
        : skill.implementation.symbol === undefined;

    if (skill.implementation.path !== candidate.path || !supportsImplementationSymbol) {
      if (supportsImplementationSymbol) {
        addEveDiagnostic(
          diagnostics,
          'EVE_SKILL_IMPLEMENTATION_NOT_WIRED',
          candidate.path,
          definition.agent.id,
          null,
          'skill',
          capabilityId,
        );
      }

      continue;
    }

    if (candidate.kind !== 'typescript') {
      continue;
    }

    const prepared = await prepareSkill(session, candidate);

    if (prepared === null) {
      const result = await session.analyzeSource(candidate.path);

      if (
        addEveSourceFailureDiagnostic(
          diagnostics,
          result,
          candidate.path,
          definition.agent.id,
          'skill',
          capabilityId,
        )
      ) {
        continue;
      }

      if (skill.implementation.symbol === 'default') {
        if (
          result.kind === 'valid' &&
          getEveDefinition(result.analysis, 'skill').kind === 'absent'
        ) {
          addEveDiagnostic(
            diagnostics,
            'EVE_SKILL_IMPLEMENTATION_SYMBOL_NOT_FOUND',
            candidate.path,
            definition.agent.id,
            null,
            'skill',
            capabilityId,
          );
        }
      }

      continue;
    }

    const registration = skill.registration;
    let isRegistrationWired = registration === undefined;

    if (registration !== undefined) {
      if (
        registration.path === candidate.path &&
        (registration.symbol === undefined || registration.symbol === 'default')
      ) {
        isRegistrationWired = true;
      } else if (registration.symbol === 'default') {
        const result = await session.analyzeSource(registration.path);

        if (
          addEveSourceFailureDiagnostic(
            diagnostics,
            result,
            registration.path,
            definition.agent.id,
            'skill',
            capabilityId,
          )
        ) {
          continue;
        }

        const registrationDefinition =
          result.kind === 'valid' ? getEveDefinition(result.analysis, 'skill') : null;

        if (registrationDefinition?.kind === 'absent') {
          addEveDiagnostic(
            diagnostics,
            'EVE_SKILL_REGISTRATION_SYMBOL_NOT_FOUND',
            registration.path,
            definition.agent.id,
            null,
            'skill',
            capabilityId,
          );
        } else if (registrationDefinition?.kind === 'present-supported') {
          addEveDiagnostic(
            diagnostics,
            'EVE_SKILL_REGISTRATION_NOT_WIRED',
            candidate.path,
            definition.agent.id,
            null,
            'skill',
            capabilityId,
          );
        }
      } else if (registration.symbol === undefined) {
        addEveDiagnostic(
          diagnostics,
          'EVE_SKILL_REGISTRATION_NOT_WIRED',
          candidate.path,
          definition.agent.id,
          null,
          'skill',
          capabilityId,
        );
      }
    }

    if (!prepared.isRegistrationEligible || !isRegistrationWired) {
      continue;
    }

    if (skill.name !== candidate.identity) {
      addEveDiagnostic(
        diagnostics,
        'EVE_SKILL_NAME_MISMATCH',
        candidate.path,
        definition.agent.id,
        null,
        'skill',
        capabilityId,
      );
      continue;
    }

    evidence.push(
      createEveEvidence({
        agentId: definition.agent.id,
        capabilityId,
        capabilityKind: 'skill',
        details: { registrationKind: 'typescript' },
        kind: 'skill-registration',
        references: [{ path: candidate.path }],
        runtimeName: candidate.identity,
        source: EVE_ADAPTER_ID,
      }),
    );
  }
};
