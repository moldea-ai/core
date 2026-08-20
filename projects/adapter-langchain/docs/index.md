---
title: LangChain adapter
description: Deterministic evidence for LangChain TypeScript createAgent applications.
order: 1
---

# LangChain adapter

`@moldea.ai/adapter-langchain` connects Repository Format `1` declarations to the static LangChain `createAgent` forms verified for `langchain` `1.5.x` and companion `@langchain/core` `1.2.x`.

The adapter begins at each declared runtime-agent path, finds its nearest owning package, checks the primary and companion declarations together, and returns immutable evidence and stable diagnostics through Core. It does not execute the application or treat package presence as proof of an agent definition.

The package exports only `langChainAdapter`. The generated API reference derives that surface from the package export.
