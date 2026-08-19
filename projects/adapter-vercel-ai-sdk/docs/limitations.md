---
title: Boundaries and limitations
description: Unsupported SDK surfaces, source forms, dynamic behavior, and the adapter security boundary.
order: 30
---

# Boundaries and limitations

The current verified targets do not claim support for:

- JavaScript, Python, CommonJS, or source outside the verified TypeScript ESM boundary
- indirect generation wrappers, request variables, nested callback calls, or generation APIs other than `generateText` and `streamText`
- `WorkflowAgent`, custom `Agent` implementations, factories, subclasses, or mutable definitions
- `Output.array`, `Output.choice`, `Output.json`, `Output.text`, or custom output implementations
- dynamic tools, provider tools, MCP-generated tools, inline tools as manifest registration identities, or mutated tools maps
- agent input schemas for direct generation wrappers
- `prepareCall` or `prepareStep` function-body interpretation
- routing, handoffs, subagents, workflow edges, provider identity, or model identity
- arbitrary compiler resolution, `tsconfig` path aliases, directory indexes, package exports, or re-export graphs
- runtime-generated strings, schema-content validation, provider compatibility, model behavior, or actual tool execution

Package detection uses nearest manifests, not lockfiles or installed `node_modules`. Static dependency ranges are observations; the adapter does not prove which package build executes at runtime.

The adapter sees only repository entries Core supplies through `IRepositoryReader`. It receives no host path, credential, environment variable, network client, or runtime process. It does not execute TypeScript, dynamically import source, load the inspected SDK, or follow source symlinks.

The [Runtime Compatibility Matrix](/compatibility/) remains authoritative. A focused specification or future design does not broaden this page until the canonical matrix and released implementation do.
