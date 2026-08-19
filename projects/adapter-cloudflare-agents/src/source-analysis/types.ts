import type ts from 'typescript';

import type {
  ICloudflareAgentsInspectionSession,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';

export type { ICloudflareAgentsInspectionSession, ICloudflareAgentsSourceAnalysis };

// exact static source string or conservative unsupported state
export type ICloudflareAgentsStaticStringResult =
  | { readonly expression: ts.Expression; readonly kind: 'supported'; readonly value: string }
  | { readonly kind: 'unsupported' };
