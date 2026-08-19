import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { VERCEL_AI_SDK_ADAPTER_ID, VERCEL_AI_SDK_PACKAGE_NAME } from '../constants/index.js';
import type { IVercelAiSdkInspectionSession } from '../contracts/index.js';
import { addVercelAiSdkDiagnostic, createVercelAiSdkEvidence } from './common.js';

/** Inspects the nearest owning package manifest for one runtime source. */
export const inspectVercelAiSdkPackage = async (
  session: IVercelAiSdkInspectionSession,
  sourcePath: IRepositoryPath,
  evidence: IRuntimeAdapterEvidence[],
  diagnostics: IAdapterDiagnostic[],
  agentId: string,
): Promise<void> => {
  const discovery = await session.discoverPackage(sourcePath);

  if (discovery.kind === 'absent') {
    return;
  }

  if (discovery.kind === 'invalid') {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_PACKAGE_MANIFEST_INVALID',
      discovery.path,
      agentId,
    );
    return;
  }

  const { observation } = discovery;

  if (observation.compatibility === 'unsupported') {
    addVercelAiSdkDiagnostic(
      diagnostics,
      'VERCEL_AI_SDK_VERSION_UNSUPPORTED',
      observation.path,
      agentId,
    );
    return;
  }

  for (const declaration of observation.declarations) {
    evidence.push(
      createVercelAiSdkEvidence({
        agentId,
        capabilityId: null,
        capabilityKind: null,
        details: {
          compatibility: observation.compatibility,
          declaredRange: declaration.declaredRange,
          dependencyKind: declaration.dependencyKind,
        },
        kind: 'runtime-package',
        references: [{ path: observation.path }],
        runtimeName: VERCEL_AI_SDK_PACKAGE_NAME,
        source: VERCEL_AI_SDK_ADAPTER_ID,
      }),
    );
  }
};
