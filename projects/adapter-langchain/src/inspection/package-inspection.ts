import { validRange } from 'semver';

import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import {
  LANGCHAIN_ADAPTER_ID,
  LANGCHAIN_CORE_PACKAGE_NAME,
  LANGCHAIN_PACKAGE_NAME,
  LANGCHAIN_TARGET_ID,
} from '../constants/index.js';
import type {
  ILangChainInspectionSession,
  ILangChainTargetPackageClassification,
} from '../contracts/index.js';
import { addLangChainDiagnostic, createLangChainEvidence } from './common.js';

const getPackageRole = (packageName: string): 'companion' | 'primary' =>
  packageName === LANGCHAIN_CORE_PACKAGE_NAME ? 'companion' : 'primary';

/** Inspects the nearest owning manifest and returns the conjunctive target state. */
export const inspectLangChainPackage = async (
  session: ILangChainInspectionSession,
  sourcePath: IRepositoryPath,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
): Promise<ILangChainTargetPackageClassification> => {
  const discovery = await session.discoverPackage(sourcePath);

  if (discovery.kind === 'absent') {
    return 'absent';
  }

  if (discovery.kind === 'invalid') {
    addLangChainDiagnostic(
      diagnostics,
      'LANGCHAIN_PACKAGE_MANIFEST_INVALID',
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
    addLangChainDiagnostic(diagnostics, 'LANGCHAIN_VERSION_UNSUPPORTED', observation.path, agentId);
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
        createLangChainEvidence({
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
            targetId: LANGCHAIN_TARGET_ID,
          },
          kind: 'runtime-package',
          references: [{ path: observation.path }],
          runtimeName:
            packageObservation.packageName === LANGCHAIN_PACKAGE_NAME
              ? LANGCHAIN_PACKAGE_NAME
              : LANGCHAIN_CORE_PACKAGE_NAME,
          source: LANGCHAIN_ADAPTER_ID,
        }),
      );
    }
  }

  return observation.targetClassification;
};
