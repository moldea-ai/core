import type { IRepositoryFormatVersion } from '@moldea.ai/core/format';

// immutable adapter, package, target, and compatibility identities
export const LANGGRAPH_ADAPTER_ID = 'langgraph';
export const LANGGRAPH_PACKAGE_NAME = '@langchain/langgraph';
export const LANGGRAPH_CORE_PACKAGE_NAME = '@langchain/core';
export const LANGGRAPH_SUPPORTED_PACKAGE_RANGE = '>=1.4.12 <1.5.0';
export const LANGGRAPH_CORE_SUPPORTED_PACKAGE_RANGE = '>=1.2.9 <1.3.0';
export const LANGGRAPH_STATE_GRAPH_TARGET_ID = 'typescript-state-graph-1-4';
export const LANGGRAPH_FUNCTIONAL_API_TARGET_ID = 'typescript-functional-api-1-4';
export const LANGGRAPH_SUPPORTED_REPOSITORY_FORMAT_VERSIONS = Object.freeze([
  1,
] satisfies readonly IRepositoryFormatVersion[]);

// stable runtime-pattern identities
export const LANGGRAPH_PATTERN_IDS = Object.freeze({
  FunctionalFinalState: 'functional-final-state',
  FunctionalInterrupt: 'functional-interrupt',
  FunctionalPreviousState: 'functional-previous-state',
  FunctionalTask: 'functional-task',
  StateGraphConditionalEdge: 'state-graph-conditional-edge',
  StateGraphEdge: 'state-graph-edge',
  StateGraphNode: 'state-graph-node',
} as const);
