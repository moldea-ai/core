---
title: Eve adapter
description: Deterministic evidence for Eve TypeScript filesystem agents.
order: 1
---

# Eve adapter

`@moldea.ai/adapter-eve` connects Repository Format `1` declarations to the static filesystem conventions verified for Eve `0.39.x`.

The adapter begins at each declared runtime-agent path, finds its nearest owning package, validates the exact Eve layout, and returns immutable evidence and stable diagnostics through Core. It neither executes the application nor treats package presence as proof of an agent definition.

The package exports only `eveAdapter`. The generated API reference derives that surface from the package export.
