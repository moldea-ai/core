---
title: Verified targets
description: Exact static forms covered by the LangGraph 1.4.x targets.
order: 10
---

# Verified targets

Targets `typescript-state-graph-1-4` and `typescript-functional-api-1-4` cover `@langchain/langgraph >=1.4.12 <1.5.0` with companion `@langchain/core >=1.2.9 <1.3.0` at experimental support level.

Graph API agent evidence requires a directly exported immutable `const` initialized by a supported `.compile(...)` call over a package-root `StateGraph`. The builder may be an inline fluent chain or one module-local `const` whose exact top-level operations precede a single compile call. Closed modern object initialization can establish input and output schema relationships. The overloaded direct-schema constructor family can establish graph identity but not schema wiring.

Graph runtime-pattern evidence covers supported positional nodes, direct edges, waiting edges, and conditional edges. Recognized collection and builder operations may preserve graph identity without being expanded into topology evidence. The emitted observations never claim a complete, reachable, or executable topology.

Functional API agent evidence requires a directly exported immutable `const` initialized by the package-root `entrypoint(...)` helper. The workflow may be inline, module-local, or a directly resolved relative ESM import. Task, interrupt, previous-state, and final-state observations must occur directly in that workflow's own lexical body.

Named import aliases and `.ts`, `.tsx`, and `.mts` sources are supported. The adapter itself supports Node.js `^22.11.0 || ^24.11.0`.
