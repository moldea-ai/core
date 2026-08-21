---
title: LangGraph adapter
description: Deterministic evidence for LangGraph TypeScript workflows.
order: 1
---

# LangGraph adapter

`@moldea.ai/adapter-langgraph` connects Repository Format `1` declarations to static Graph API and Functional API forms verified for `@langchain/langgraph` `1.4.x` with companion `@langchain/core` `1.2.x`.

The adapter begins at each declared runtime-agent path, finds its nearest owning package, checks the primary and companion declarations together, and returns immutable evidence and stable diagnostics through Core. It does not execute the application or treat package presence as proof of a LangGraph workflow.

The package exports only `langGraphAdapter`. The generated API reference derives that surface from the package export.
