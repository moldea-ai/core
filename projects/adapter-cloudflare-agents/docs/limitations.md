---
title: Boundaries and limitations
description: Unsupported Cloudflare surfaces, source forms, and the adapter security boundary.
order: 30
---

# Boundaries and limitations

The current verified targets do not claim support for:

- JavaScript, Python, CommonJS, default imports, namespace imports, or source outside TypeScript ESM
- the bare `Agent` class, custom harnesses, factories, indirect subclasses, re-export graphs, or decorators
- executable class fields, static blocks, computed member names, generator methods, or non-pass-through constructors
- dynamic session builders, `onCompaction`, mutable definitions, open tools maps, or channel-provided tool replacement
- nested generation calls, request variables, `prepareStep` instruction interpretation, or generation APIs other than `generateText` and `streamText`
- output variants other than `Output.object({ schema })` or any agent input schema
- dynamic, provider, MCP-generated, or inline tools as manifest registration identities
- arbitrary compiler resolution, `tsconfig` path aliases, directory indexes, package exports, or general re-export graphs
- runtime-generated strings, schema-content validation, provider compatibility, model behavior, or actual tool execution

Package detection uses nearest manifests, not lockfiles or installed `node_modules`. The adapter sees only repository entries Core supplies through `IRepositoryReader`. It receives no host path, credential, environment variable, network client, or runtime process.
