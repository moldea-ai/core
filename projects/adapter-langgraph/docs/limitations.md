---
title: Limitations
description: Conservative boundaries of the initial LangGraph adapter targets.
order: 30
---

# Limitations

The initial targets intentionally exclude JavaScript and CommonJS, package subpath runtime imports, namespace imports, default imports, re-exports, barrels, path aliases, directory indexes, graph factories, dynamic builders, prebuilt agents, complete topology reconstruction, runtime-generated routes, `Command` and `Send` destinations, and semantic inspection of node, router, or task bodies.

LangChain `createAgent(...)` remains owned by the `langchain` runtime boundary. Deep Agents, supervisor libraries, and other higher-level frameworks remain their own highest-level boundary when an official target covers them. Package presence alone never changes runtime ownership.

Functional API tasks are durable workflow units, not automatically model-visible tools. The adapter emits no tool, skill, instruction, handoff, provider-model, context-schema, checkpointer, store, or Functional API schema evidence.

The adapter does not validate LangGraph runtime acceptance, schema semantics, reducer correctness, checkpoint serialization, task idempotency, interrupt safety, provider compatibility, routing intent, graph reachability, or runtime execution.
