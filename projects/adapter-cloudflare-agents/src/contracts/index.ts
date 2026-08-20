import type ts from 'typescript';

import type { ISourceRange } from '@moldea.ai/core';
import type { IAdapterDiagnostic } from '@moldea.ai/core/adapter';
import type { IRepositoryEntry, IRepositoryPath } from '@moldea.ai/repository';

export type ICloudflareAgentsTargetId =
  'typescript-think-0-16-ai-sdk-7' | 'typescript-ai-chat-agent-0-10-ai-sdk-7';

export type ICloudflareAgentsAdapterDiagnosticCode =
  | 'CLOUDFLARE_AGENTS_PACKAGE_MANIFEST_INVALID'
  | 'CLOUDFLARE_AGENTS_RUNTIME_VERSION_UNSUPPORTED'
  | 'CLOUDFLARE_AGENTS_SOURCE_TEXT_INVALID'
  | 'CLOUDFLARE_AGENTS_SOURCE_SYNTAX_INVALID'
  | 'CLOUDFLARE_AGENTS_RUNTIME_AGENT_SYMBOL_NOT_FOUND'
  | 'CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND'
  | 'CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND'
  | 'CLOUDFLARE_AGENTS_TOOL_REGISTRATION_SYMBOL_NOT_FOUND'
  | 'CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND'
  | 'CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_NOT_WIRED'
  | 'CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_NOT_WIRED'
  | 'CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_NOT_WIRED'
  | 'CLOUDFLARE_AGENTS_TOOL_REGISTRATION_NOT_WIRED'
  | 'CLOUDFLARE_AGENTS_TOOL_NAME_MISMATCH'
  | 'CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_NOT_WIRED'
  | 'CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_NOT_WIRED'
  | 'CLOUDFLARE_AGENTS_HANDOFF_TARGET_AMBIGUOUS'
  | 'CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_MISSING'
  | 'CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED';

export type ICloudflareAgentsPackageCompatibility = 'ambiguous' | 'supported' | 'unsupported';

export type ICloudflareAgentsPackageDependencyKind =
  'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';

export interface ICloudflareAgentsPackageDeclaration {
  readonly declaredRange: string;
  readonly dependencyKind: ICloudflareAgentsPackageDependencyKind;
}

export interface ICloudflareAgentsPackageObservation {
  readonly declarations: ReadonlyMap<string, readonly ICloudflareAgentsPackageDeclaration[]>;
  readonly path: IRepositoryPath;
}

export type ICloudflareAgentsPackageDiscoveryResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid'; readonly path: IRepositoryPath }
  | { readonly kind: 'observed'; readonly observation: ICloudflareAgentsPackageObservation };

export interface ICloudflareAgentsImports {
  readonly agentToolNames: ReadonlySet<string>;
  readonly aiChatAgentNames: ReadonlySet<string>;
  readonly generateTextNames: ReadonlySet<string>;
  readonly outputNames: ReadonlySet<string>;
  readonly streamTextNames: ReadonlySet<string>;
  readonly thinkNames: ReadonlySet<string>;
  readonly toolNames: ReadonlySet<string>;
}

export type ICloudflareAgentsModuleExportState =
  | { readonly kind: 'absent' }
  | { readonly declaration: ts.Node; readonly kind: 'present-supported' }
  | { readonly declaration: ts.Node; readonly kind: 'present-unsupported' };

export type ICloudflareAgentsTextResult =
  | { readonly valid: false }
  | {
      readonly locator: { locateRange(startOffset: number, endOffset: number): ISourceRange };
      readonly valid: true;
      readonly value: string;
    };

export interface ICloudflareAgentsSourceAnalysis {
  readonly clientNames: ReadonlySet<string>;
  readonly constructorNames: ReadonlySet<string>;
  readonly exports: ReadonlyMap<
    string,
    ICloudflareAgentsModuleExportState & { readonly declaration: ts.Node }
  >;
  readonly identifierUses: ReadonlyMap<string, readonly ts.Identifier[]>;
  readonly imports: ICloudflareAgentsImports;
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
  readonly text: ICloudflareAgentsTextResult & { readonly valid: true };
}

export type ICloudflareAgentsSourceAnalysisResult =
  | { readonly kind: 'invalid-syntax'; readonly range: ISourceRange | null }
  | { readonly kind: 'invalid-text' }
  | { readonly analysis: ICloudflareAgentsSourceAnalysis; readonly kind: 'valid' };

export type ICloudflareAgentsRelationship =
  | { readonly kind: 'absent' }
  | { readonly expression: ts.Expression; readonly kind: 'present' }
  | { readonly kind: 'unresolved' };

export interface ICloudflareAgentsMethod {
  readonly body: ts.Block;
  readonly declaration: ts.MethodDeclaration;
}

export interface ICloudflareAgentsClassDefinition {
  readonly declaration: ts.ClassDeclaration;
  readonly methods: ReadonlyMap<string, ICloudflareAgentsMethod>;
  readonly targetId: ICloudflareAgentsTargetId;
}

export type ICloudflareAgentsClassDefinitionResult =
  | { readonly kind: 'absent' }
  | {
      readonly declaration: ts.Node;
      readonly kind: 'present-unsupported';
      readonly targetId?: ICloudflareAgentsTargetId;
    }
  | { readonly definition: ICloudflareAgentsClassDefinition; readonly kind: 'present-supported' };

export interface ICloudflareAgentsGenerationRequest {
  readonly call: 'generateText' | 'streamText';
  readonly instructions: ICloudflareAgentsRelationship;
  readonly object: ts.ObjectLiteralExpression;
  readonly output: ICloudflareAgentsRelationship;
  readonly tools: ICloudflareAgentsRelationship;
}

export interface ICloudflareAgentsFunctionTool {
  readonly declaration: ts.VariableDeclaration;
  readonly execute: ICloudflareAgentsRelationship;
  readonly inputSchema: ICloudflareAgentsRelationship;
  readonly outputSchema: ICloudflareAgentsRelationship;
}

export interface ICloudflareAgentsAgentTool {
  readonly declaration: ts.VariableDeclaration;
  readonly description: string | null;
  readonly target: ts.Expression;
}

export type ICloudflareAgentsToolDefinition =
  | { readonly kind: 'agent-tool'; readonly tool: ICloudflareAgentsAgentTool }
  | { readonly kind: 'function-tool'; readonly tool: ICloudflareAgentsFunctionTool };

export interface ICloudflareAgentsToolMapEntry {
  readonly expression: ts.Expression;
  readonly name: string;
}

export type ICloudflareAgentsToolMapResult =
  | { readonly entries: readonly ICloudflareAgentsToolMapEntry[]; readonly kind: 'closed' }
  | { readonly entries: readonly ICloudflareAgentsToolMapEntry[]; readonly kind: 'unresolved' };

export interface ICloudflareAgentsInspectionSession {
  readonly signal?: AbortSignal;
  analyzeSource(path: IRepositoryPath): Promise<ICloudflareAgentsSourceAnalysisResult>;
  discoverPackage(path: IRepositoryPath): Promise<ICloudflareAgentsPackageDiscoveryResult>;
  getEntry(path: IRepositoryPath): Promise<IRepositoryEntry | null>;
}

export type ICloudflareAgentsDiagnosticInput = Omit<IAdapterDiagnostic, 'message' | 'source'> & {
  readonly code: ICloudflareAgentsAdapterDiagnosticCode;
};
