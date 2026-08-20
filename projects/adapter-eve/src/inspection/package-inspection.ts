import { validRange } from 'semver';

import type { IIndexedAgent, IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { EVE_ADAPTER_ID, EVE_TARGET_ID } from '../constants/index.js';
import type { IEveInspectionSession, IEvePackageObservation } from '../contracts/index.js';
import { addEveDiagnostic, createEveEvidence } from './common.js';

/** Inspects one scoped agent's nearest Eve package declaration. */
export const inspectEvePackage = async (
  session: IEveInspectionSession,
  agent: IIndexedAgent,
  sourcePath: IRepositoryPath,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
): Promise<IEvePackageObservation | null> => {
  const result = await session.discoverPackage(sourcePath);

  if (result.kind === 'absent') {
    return null;
  }

  if (result.kind === 'invalid') {
    addEveDiagnostic(diagnostics, 'EVE_PACKAGE_MANIFEST_INVALID', result.path, agent.id);
    return null;
  }

  const { observation } = result;

  if (observation.compatibility === 'unsupported') {
    addEveDiagnostic(diagnostics, 'EVE_SDK_VERSION_UNSUPPORTED', observation.path, agent.id);
    return null;
  }

  for (const declaration of observation.declarations) {
    const isSemver =
      validRange(declaration.declaredRange, {
        includePrerelease: false,
        loose: false,
      }) !== null;

    evidence.push(
      createEveEvidence({
        agentId: agent.id,
        capabilityId: null,
        capabilityKind: null,
        details: {
          dependencyKind: declaration.dependencyKind,
          ...(isSemver ? { declaredRange: declaration.declaredRange } : {}),
          packageClassification: observation.compatibility,
          targetId: EVE_TARGET_ID,
        },
        kind: 'runtime-package',
        references: [{ path: observation.path }],
        runtimeName: null,
        source: EVE_ADAPTER_ID,
      }),
    );
  }

  return observation;
};
