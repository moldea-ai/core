---
title: Verified target
description: Exact static forms covered by the Eve 0.39.x filesystem-agent target.
order: 10
---

# Verified target

Target `typescript-filesystem-agent-0-39` covers `eve >=0.39.1 <0.40.0` at experimental support level.

Positive agent evidence requires an uncollided flat or nested `agent.ts` that directly default-exports `defineAgent(...)`, uses only `model`, optional `description`, and optional `outputSchema`, and resolves `model` to a supported static string. Directory-backed local subagents use the same rule recursively.

Instructions require one exclusive exact-lowercase `instructions.md` or one exact-shape `instructions.ts`. Tools are discovered recursively under `tools/`, use Eve's exact path-segment grammar, and flatten path separators to hyphens. Positive skill registration is limited to uncollided direct TypeScript `defineSkill(...)` modules.

The adapter itself supports Node.js `^22.11.0 || ^24.11.0`. Applications that execute Eve `0.39.x` require Node.js 24 or newer according to Eve's package metadata.
