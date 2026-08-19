import type { IRuntimeAdapterEvidence } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryPath } from '@moldea.ai/repository';

import { CLAUDE_AGENT_SDK_ADAPTER_ID, CLAUDE_AGENT_SDK_PACKAGE_NAME } from '../constants/index.js';
import type { IClaudeAgentSdkInspectionSession } from '../contracts/index.js';
import { addClaudeAgentSdkDiagnostic, createClaudeAgentSdkEvidence } from './common.js';

/** Inspects the nearest owning package manifest for one runtime source. */
export const inspectClaudeAgentSdkPackage = async (
  session: IClaudeAgentSdkInspectionSession,
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
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_PACKAGE_MANIFEST_INVALID',
      discovery.path,
      agentId,
    );
    return;
  }

  const { observation } = discovery;

  if (observation.compatibility === 'unsupported') {
    addClaudeAgentSdkDiagnostic(
      diagnostics,
      'CLAUDE_AGENT_SDK_VERSION_UNSUPPORTED',
      observation.path,
      agentId,
    );
    return;
  }

  for (const declaration of observation.declarations) {
    evidence.push(
      createClaudeAgentSdkEvidence({
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
        runtimeName: CLAUDE_AGENT_SDK_PACKAGE_NAME,
        source: CLAUDE_AGENT_SDK_ADAPTER_ID,
      }),
    );
  }
};
