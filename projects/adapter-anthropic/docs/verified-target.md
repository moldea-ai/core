---
title: Verified target
description: Exact supported source language, Messages API pattern, package detection, and binding behavior.
order: 10
---

# Verified target

The canonical Runtime Compatibility Matrix defines the technical target as `typescript-messages-api-0-117`.

## Supported boundary

- TypeScript ESM files using `.ts`, `.tsx`, or `.mts`
- default or named `Anthropic` value imports from `@anthropic-ai/sdk`, including aliases
- a nearest owning package manifest declaring `@anthropic-ai/sdk >=0.117.1 <0.118.0`
- a module-local Anthropic client created directly with a supported constructor binding
- a directly exported runtime-agent function with direct `client.messages.create({ ... })` calls
- one request argument or a second ignored request-options argument
- direct instruction-loader wiring through `system`, optionally awaited
- closed inline or immutable module-local client-tool arrays through `tools`
- direct tool input-schema wiring through `input_schema`

Bindings must remain lexically visible at each matched use. Parameters or local declarations that shadow the client, loader, registration, or input schema do not establish evidence.

## Messages request analysis

Each supported call is analyzed independently. `system` and `tools` have separate closure, and an exact `stream` property is ignored. Exact shorthand relationship properties are treated as direct identifier values. Computed relationship properties, spreads, duplicate effective properties, methods, getters, or setters leave only the affected relationship unresolved.

Positive evidence is existential across supported calls. A negative wiring diagnostic requires every relevant supported call to prove the relationship absent with no unresolved candidate.

## Static client tools

Supported client-tool objects require a static `name` and `input_schema`. `description`, `strict`, and `type` are optional; `strict` accepts only literal booleans, and `type` accepts `custom` or `null`. The statically named `allowed_callers`, `cache_control`, `defer_loading`, `eager_input_streaming`, and `input_examples` fields are tolerated without interpreting their values.

Tool names match `^[A-Za-z0-9_-]{1,64}$` against the complete Unicode-scalar sequence. Only ASCII letters, digits, underscores, and hyphens are accepted, and no Unicode normalization is applied.

Inline schemas support static strings, no-substitution templates, signed numbers, booleans, `null`, arrays without holes or spreads, and objects with exact identifier or string-literal properties. The adapter proves wiring, not provider schema validity.
