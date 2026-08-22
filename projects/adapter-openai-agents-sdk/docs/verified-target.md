---
title: Verified target
description: Exact source, package, agent, tool, schema, handoff, and routing-description support.
order: 10
---

# Verified target

The canonical Runtime Compatibility Matrix defines the technical target `typescript-agent-handoffs-0-16`.

## Supported boundary

- TypeScript ESM `.ts`, `.tsx`, and `.mts` files
- a nearest owning package manifest declaring npm `@openai/agents >=0.16.1 <0.17.0`
- named value imports from the `@openai/agents` package root, including aliases
- a directly exported module-local `const` initialized through `new Agent({ ... })` or `Agent.create({ ... })`
- direct, awaited, referenced, or supported single-return-wrapper instruction-loader wiring
- direct agent output schemas through `outputType`
- directly exported function tools created through `tool({ ... })`
- direct tool implementations through `execute`, input schemas through `parameters`, and output schemas through `outputSchema`
- closed inline or immutable module-local arrays for agent tools and handoffs
- direct target-agent handoffs and closed `handoff(target, { ... })` registrations
- effective routing descriptions from a non-empty static `toolDescriptionOverride`, target `handoffDescription`, or the canonical agent-description fallback

Bindings must remain lexically visible at each matched use. Supported relative named imports resolve an exact TypeScript path, `.js` to `.ts` or `.tsx`, and `.mjs` to `.mts`. Re-exports, directory indexes, path aliases, CommonJS, and package-export resolution are outside the target.

## Relationship closure

Agent configurations, function tools, and configured handoffs are analyzed independently by relationship. Unrelated dynamic properties do not erase a proved relationship. A computed or duplicate relationship property, object spread, unsupported value, or relevant post-construction mutation leaves only the relationships it could obscure unresolved.

Negative wiring diagnostics require supported closed source to prove the declared relationship absent or contradictory. Dynamic and unsupported candidates remain unestablished rather than becoming definite failures.

## Static strings and routing

Agent names, tool names, `handoffDescription`, `toolNameOverride`, and `toolDescriptionOverride` support string literals, no-substitution templates, immutable module-local constants, and directly imported immutable string constants. Values are compiler-parsed and are not trimmed or normalized.

A non-empty static `toolDescriptionOverride` is authoritative for one configured registration. A static empty override falls back to target metadata. Without an authoritative override, the target's canonical handoff description is preferred and its canonical agent description is the fallback.
