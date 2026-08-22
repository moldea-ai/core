---
title: Verified target
description: Exact supported source language, module form, Responses pattern, package detection, and binding behavior.
order: 10
---

# Verified target

The canonical Runtime Compatibility Matrix defines the technical target as `typescript-responses-api-7`.

## Supported boundary

- TypeScript ESM files
- supported direct default and relative named imports
- a nearest owning package manifest declaring npm `openai >=7.4.0 <8.0.0`
- a module-local OpenAI client
- a bound exported runtime-agent function with direct `client.responses.create({ ... })` object-literal calls
- direct instruction-loader wiring through `instructions`, optionally awaited
- closed inline or immutable module-local function-tool arrays through `tools`
- direct tool input-schema wiring through function-tool `parameters`

Bindings must remain lexically visible at each matched use. Parameters or local declarations that shadow the OpenAI client, loader, tool registration, or input schema do not establish evidence.

## Responses request analysis

Each supported call is analyzed independently. `instructions` and `tools` have separate closure: a dynamic unrelated property does not erase a statically provable relationship. Exact shorthand relationship properties are treated as direct identifier values. Computed relationship properties, spreads, duplicate effective properties, methods, getters, or setters leave only the affected relationship unresolved.

Positive evidence is existential across supported calls. A negative wiring diagnostic requires every relevant supported call to prove the relationship absent with no unresolved candidate. This prevents dynamic code from being mislabeled as a definite failure.

## Static function tools

Supported function-tool objects require exact `type`, `name`, `parameters`, and `strict` properties. A static or `null` description is supported. `allowed_callers`, `defer_loading`, and `output_schema` are tolerated but not interpreted. Unknown properties or unsupported members leave registration unestablished.

Inline schema values support static strings, no-substitution templates, signed numbers, booleans, `null`, arrays without holes or spreads, and objects with exact identifier or string-literal properties. The adapter proves wiring, not OpenAI schema validity.
