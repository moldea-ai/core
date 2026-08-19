import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import {
  OPENAI_AGENTS_SDK_ADAPTER_ID,
  OPENAI_AGENTS_SDK_PACKAGE_NAME,
} from '../constants/index.js';
import type { IOpenAiAgentsSdkInspectionSession } from '../contracts/index.js';
import { addOpenAiAgentsSdkDiagnostic, createOpenAiAgentsSdkEvidence } from './common.js';

/** Inspects the nearest owning package manifest for one runtime source. */
export const inspectOpenAiAgentsSdkPackage = async (
  session: IOpenAiAgentsSdkInspectionSession,
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
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_PACKAGE_MANIFEST_INVALID',
      discovery.path,
      agentId,
    );
    return;
  }

  const { observation } = discovery;

  if (observation.compatibility === 'unsupported') {
    addOpenAiAgentsSdkDiagnostic(
      diagnostics,
      'OPENAI_AGENTS_SDK_VERSION_UNSUPPORTED',
      observation.path,
      agentId,
    );
    return;
  }

  for (const declaration of observation.declarations) {
    evidence.push(
      createOpenAiAgentsSdkEvidence({
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
        runtimeName: OPENAI_AGENTS_SDK_PACKAGE_NAME,
        source: OPENAI_AGENTS_SDK_ADAPTER_ID,
      }),
    );
  }
};
