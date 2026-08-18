import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { GOOGLE_GENAI_ADAPTER_ID, GOOGLE_GENAI_SDK_PACKAGE_NAME } from '../constants/index.js';
import type { IGoogleGenAiInspectionSession } from '../contracts/index.js';
import { addGoogleGenAiDiagnostic, createGoogleGenAiEvidence } from './common.js';

/**
 * Inspects the nearest owning package manifest for one agent runtime source.
 * @param session The operation-local inspection session.
 * @param sourcePath The runtime-agent source path.
 * @param evidence The operation evidence collection.
 * @param diagnostics The operation diagnostic collection.
 * @param agentId The owning agent identifier.
 */
export const inspectGoogleGenAiPackage = async (
  session: IGoogleGenAiInspectionSession,
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
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_PACKAGE_MANIFEST_INVALID',
      discovery.path,
      agentId,
    );
    return;
  }

  const { observation } = discovery;

  if (observation.compatibility === 'unsupported') {
    addGoogleGenAiDiagnostic(
      diagnostics,
      'GOOGLE_GENAI_SDK_VERSION_UNSUPPORTED',
      observation.path,
      agentId,
    );
    return;
  }

  for (const declaration of observation.declarations) {
    evidence.push(
      createGoogleGenAiEvidence({
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
        runtimeName: GOOGLE_GENAI_SDK_PACKAGE_NAME,
        source: GOOGLE_GENAI_ADAPTER_ID,
      }),
    );
  }
};
