import { validRange } from 'semver';

import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import {
  LANGGRAPH_ADAPTER_ID,
  LANGGRAPH_CORE_PACKAGE_NAME,
  LANGGRAPH_PACKAGE_NAME,
} from '../constants/index.js';
import type {
  ILangGraphInspectionSession,
  ILangGraphTargetPackageClassification,
} from '../contracts/index.js';
import { addLangGraphDiagnostic, createLangGraphEvidence } from './common.js';

const getPackageRole = (packageName: string): 'companion' | 'primary' =>
  packageName === LANGGRAPH_CORE_PACKAGE_NAME ? 'companion' : 'primary';

/** Inspects the nearest owning manifest and returns the conjunctive target package state. */
export const inspectLangGraphPackage = async (
  session: ILangGraphInspectionSession,
  sourcePath: IRepositoryPath,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
): Promise<ILangGraphTargetPackageClassification> => {
  const discovery = await session.discoverPackage(sourcePath);

  if (discovery.kind === 'absent') {
    return 'absent';
  }

  if (discovery.kind === 'invalid') {
    addLangGraphDiagnostic(
      diagnostics,
      'LANGGRAPH_PACKAGE_MANIFEST_INVALID',
      discovery.path,
      agentId,
    );
    return 'absent';
  }

  const { observation } = discovery;

  if (observation.targetClassification === 'absent') {
    return observation.targetClassification;
  }

  if (observation.targetClassification === 'unsupported') {
    addLangGraphDiagnostic(diagnostics, 'LANGGRAPH_VERSION_UNSUPPORTED', observation.path, agentId);
    return observation.targetClassification;
  }

  for (const packageObservation of observation.packages) {
    for (const declaration of packageObservation.declarations) {
      const isSemverRange =
        validRange(declaration.declaredRange, {
          includePrerelease: false,
          loose: false,
        }) !== null;

      evidence.push(
        createLangGraphEvidence({
          agentId,
          capabilityId: null,
          capabilityKind: null,
          details: {
            classification: packageObservation.compatibility,
            dependencyKind: declaration.dependencyKind,
            ...(isSemverRange ? { declaredRange: declaration.declaredRange } : {}),
            packageName: packageObservation.packageName,
            packageRole: getPackageRole(packageObservation.packageName),
            targetClassification: observation.targetClassification,
          },
          kind: 'runtime-package',
          references: [{ path: observation.path }],
          runtimeName:
            packageObservation.packageName === LANGGRAPH_PACKAGE_NAME
              ? LANGGRAPH_PACKAGE_NAME
              : LANGGRAPH_CORE_PACKAGE_NAME,
          source: LANGGRAPH_ADAPTER_ID,
        }),
      );
    }
  }

  return observation.targetClassification;
};
