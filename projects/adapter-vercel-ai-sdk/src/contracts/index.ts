import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

// stable package-owned diagnostic codes
export type IVercelAiSdkAdapterDiagnosticCode =
  | 'VERCEL_AI_SDK_PACKAGE_MANIFEST_INVALID'
  | 'VERCEL_AI_SDK_VERSION_UNSUPPORTED'
  | 'VERCEL_AI_SDK_SOURCE_TEXT_INVALID'
  | 'VERCEL_AI_SDK_SOURCE_SYNTAX_INVALID'
  | 'VERCEL_AI_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'VERCEL_AI_SDK_INSTRUCTION_LOADER_NOT_WIRED'
  | 'VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_NOT_WIRED'
  | 'VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED'
  | 'VERCEL_AI_SDK_TOOL_IMPLEMENTATION_NOT_WIRED'
  | 'VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED'
  | 'VERCEL_AI_SDK_TOOL_NAME_MISMATCH'
  | 'VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED'
  | 'VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED';

export type IVercelAiSdkPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

export type IVercelAiSdkPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

export interface IVercelAiSdkPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: IVercelAiSdkPackageDependencyKind;
}

// nearest owning package observation
export interface IVercelAiSdkPackageObservation {
  readonly compatibility: IVercelAiSdkPackageCompatibility;
  readonly declarations: readonly IVercelAiSdkPackageDeclaration[];
  readonly path: IRepositoryPath;
}

export type IVercelAiSdkPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: IVercelAiSdkPackageObservation };

// supported root ai imports indexed in addition to provider-neutral imports
export interface IVercelAiSdkImports {
  readonly generateTextNames: ReadonlySet<string>;
  readonly outputNames: ReadonlySet<string>;
  readonly streamTextNames: ReadonlySet<string>;
  readonly toolLoopAgentNames: ReadonlySet<string>;
  readonly toolNames: ReadonlySet<string>;
}

export type IVercelAiSdkModuleExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

export type IVercelAiSdkTextResult =
  | { readonly valid: false }
  | {
      readonly locator: { locateRange(startOffset: number, endOffset: number): ISourceRange };
      readonly valid: true;
      readonly value: string;
    };

// parsed source and Vercel AI SDK bindings used only within one inspection
export interface IVercelAiSdkSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    IVercelAiSdkModuleExportState & { readonly declaration: ts.Node }
  >;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly imports: IVercelAiSdkImports;
  readonly localBindingNames: ReadonlyMap<ts.Node, ReadonlySet<string>>;
  readonly moduleArrays: ReadonlyMap<
    string,
    { readonly declaration: ts.VariableDeclaration; readonly expression: ts.ArrayLiteralExpression }
  >;
  readonly moduleConstDeclarations: ReadonlyMap<string, ts.VariableDeclaration>;
  readonly namedImports: ReadonlyMap<
    string,
    { readonly importedName: string; readonly moduleSpecifier: string }
  >;
  readonly path: IRepositoryPath;
  readonly safeModuleArrayNames: ReadonlySet<string>;
  readonly sourceFile: ts.SourceFile;
  readonly text: IVercelAiSdkTextResult & { readonly valid: true };
}

export type IVercelAiSdkSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: IVercelAiSdkSourceAnalysis; readonly kind: 'valid' };

export type IVercelAiSdkRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

// supported directly exported ToolLoopAgent definition
export interface IVercelAiSdkToolLoopAgentDefinition {
  readonly callOptionsSchema: IVercelAiSdkRelationship;
  readonly declaration: ts.VariableDeclaration;
  readonly id: IVercelAiSdkRelationship;
  readonly instructions: IVercelAiSdkRelationship;
  readonly object: ts.ObjectLiteralExpression;
  readonly output: IVercelAiSdkRelationship;
  readonly tools: IVercelAiSdkRelationship;
}

export type IVercelAiSdkToolLoopAgentDefinitionResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | {
      readonly definition: IVercelAiSdkToolLoopAgentDefinition;
      readonly kind: 'present-supported';
    };

// one supported direct generation request
export interface IVercelAiSdkGenerationRequest {
  readonly call: 'generateText' | 'streamText';
  readonly instructions: IVercelAiSdkRelationship;
  readonly object: ts.ObjectLiteralExpression;
  readonly output: IVercelAiSdkRelationship;
  readonly tools: IVercelAiSdkRelationship;
}

// complete direct-call set for one directly exported generation wrapper
export interface IVercelAiSdkGenerationWrapper {
  readonly declaration: ts.Node;
  readonly hasAmbiguousCandidate: boolean;
  readonly requests: readonly IVercelAiSdkGenerationRequest[];
}

export type IVercelAiSdkGenerationWrapperResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | {
      readonly kind: 'present-supported';
      readonly wrapper: IVercelAiSdkGenerationWrapper;
    };

// supported root Output.object(...) relationship
export type IVercelAiSdkOutputSchemaRelationship =
  | { readonly kind: 'absent' }
  | { readonly kind: 'unresolved' }
  | { readonly expression: ts.Expression; readonly kind: 'present' };

// supported root tool(...) declaration
export interface IVercelAiSdkFunctionTool {
  readonly declaration: ts.VariableDeclaration;
  readonly execute: IVercelAiSdkRelationship;
  readonly inputSchema: IVercelAiSdkRelationship;
  readonly object: ts.ObjectLiteralExpression;
  readonly outputSchema: IVercelAiSdkRelationship;
}

export type IVercelAiSdkFunctionToolResult =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' }
  | { readonly kind: 'present-supported'; readonly tool: IVercelAiSdkFunctionTool };

// one supported own entry in a tools-map relationship
export interface IVercelAiSdkToolMapEntry {
  readonly expression: ts.Expression;
  readonly name: string;
}

export type IVercelAiSdkToolMapResult =
  | { readonly entries: readonly IVercelAiSdkToolMapEntry[]; readonly kind: 'closed' }
  | { readonly entries: readonly IVercelAiSdkToolMapEntry[]; readonly kind: 'unresolved' };

// operation-local repository access isolates bytes and parse results per inspection
export interface IVercelAiSdkInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<IVercelAiSdkSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<IVercelAiSdkPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

// complete input used to construct one safe adapter diagnostic
export type IVercelAiSdkDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: IVercelAiSdkAdapterDiagnosticCode;
};
