---
title: Limitations
description: Conservative boundaries of the initial LangChain adapter target.
order: 30
---

# Limitations

The initial target intentionally excludes JavaScript and CommonJS, configuration objects passed by reference, wrapper factories, re-exports, path aliases, package barrels, legacy agent executors, direct LangGraph graphs, Deep Agents, supervisor libraries, headless tools, custom tool classes, provider and server tools, toolkits, MCP conversions, and dynamic tool collections.

Non-empty or unresolved middleware suppresses instruction, agent output-schema, and tool-registration conclusions. Developer-authored response-format arrays are not mapped to the Repository Format's single agent output-schema binding. `stateSchema` and `contextSchema` do not become agent input-schema evidence, and implementation return types do not become tool output-schema evidence.

The adapter does not validate model availability, provider compatibility, schema semantics, tool safety, prompt quality, routing intent, or runtime execution. Direct LangGraph applications remain the responsibility of the separate `langgraph` runtime boundary.
