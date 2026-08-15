import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { OPENAI_ADAPTER_ID, OPENAI_SDK_PACKAGE_NAME } from '../constants/index.js';
import type { IOpenAiInspectionSession } from '../contracts/index.js';
import { addOpenAiDiagnostic, createOpenAiEvidence } from './common.js';

/**
 * Inspects the nearest owning package manifest for one agent runtime source.
 * @param session The operation-local inspection session.
 * @param sourcePath The runtime-agent source path.
 * @param evidence The operation evidence collection.
 * @param diagnostics The operation diagnostic collection.
 * @param agentId The owning agent identifier.
 */
export const inspectOpenAiPackage = async (
  session: IOpenAiInspectionSession,
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
    addOpenAiDiagnostic(diagnostics, 'OPENAI_PACKAGE_MANIFEST_INVALID', discovery.path, agentId);
    return;
  }

  const { observation } = discovery;

  if (observation.compatibility === 'unsupported') {
    addOpenAiDiagnostic(diagnostics, 'OPENAI_SDK_VERSION_UNSUPPORTED', observation.path, agentId);
    return;
  }

  for (const declaration of observation.declarations) {
    evidence.push(
      createOpenAiEvidence({
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
        runtimeName: OPENAI_SDK_PACKAGE_NAME,
        source: OPENAI_ADAPTER_ID,
      }),
    );
  }
};
