---
title: Verified targets
description: Exact ToolLoopAgent, direct-generation, instruction, schema, and function-tool support.
order: 10
---

# Verified targets

The canonical Runtime Compatibility Matrix defines technical targets `typescript-tool-loop-agent-7` and `typescript-generate-stream-text-7`.

## Shared boundary

- TypeScript ESM `.ts`, `.tsx`, and `.mts` files
- a nearest owning package manifest declaring npm `ai >=7.0.66 <8.0.0`
- named runtime value imports from the `ai` package root, including aliases
- direct or awaited instruction-loader calls
- structured output through `Output.object({ schema })`
- directly exported immutable `tool({ ... })` function-tool declarations
- direct tool implementation, input-schema, and output-schema bindings
- closed own-property tools maps whose keys establish tool runtime names

Bindings must remain lexically visible at each matched use. Supported relative named imports resolve an exact TypeScript path, `.js` to `.ts` or `.tsx`, and `.mjs` to `.mts`. Re-exports, directory indexes, path aliases, CommonJS, and package-export resolution are outside the targets.

## ToolLoopAgent

A directly exported module-local `const` must be initialized by `new ToolLoopAgent({ ... })`. The adapter analyzes `id`, `instructions`, `callOptionsSchema`, `output`, and `tools` independently. A `prepareCall` property leaves instructions, tools, and output unresolved. A `prepareStep` property leaves only instructions unresolved.

The optional static `id` becomes the agent-definition runtime name only when it satisfies Core's machine-string contract. It is not routing metadata.

## Direct generation

A directly exported function declaration, arrow function, or function expression must contain a direct `generateText({ ... })` or `streamText({ ... })` call in its own lexical body. `instructions` takes precedence over the deprecated `system` fallback. `prepareStep` leaves instructions unresolved without obscuring outer tools or output.

Positive evidence is existential across supported calls. Negative diagnostics require every relevant candidate to be closed and contradictory. Nested, indirect, non-object, or otherwise unsupported candidates suppress optimistic negative conclusions.

## Relationship closure

Computed properties, spreads, duplicate relationship properties, relevant mutations, and JavaScript prototype setters leave only the relationships they can obscure unresolved. A tools-map `__proto__` property assignment is ignored because it is not an own enumerable key; shorthand `__proto__` remains an own tool key.
