import type ts from 'typescript';

import type {
  IVercelAiSdkInspectionSession,
  IVercelAiSdkSourceAnalysis,
} from '../contracts/index.js';

export type { IVercelAiSdkInspectionSession, IVercelAiSdkSourceAnalysis };

// exact static source string or conservative unsupported state
export type IVercelAiSdkStaticStringResult =
  | { readonly expression: ts.Expression; readonly kind: 'supported'; readonly value: string }
  | { readonly kind: 'unsupported' };
