---
title: Boundaries and limitations
description: Explicitly unsupported APIs, source forms, inferred behavior, and the adapter security boundary.
order: 30
---

# Boundaries and limitations

The current verified target does not claim support for:

- JavaScript, Python, CommonJS, or other source languages and module forms
- OpenAI Agents SDK
- Chat Completions
- Realtime
- Assistants
- streaming semantics
- provider-hosted configuration
- source factories, mutable relationship arrays, computed relationship properties, or indirect request values
- agent input or output-schema evidence
- tool implementation or output-schema evidence
- skills, variables, or runtime-native routing evidence

Chat Completions and other APIs are outside the target but are not rejected merely because Responses is preferred. Their presence does not become an available compatibility claim.

Package detection uses nearest manifests, not lockfiles or installed `node_modules`. Static dependency ranges are observations; the adapter does not prove which package build executes at runtime.

The adapter sees only repository entries Core supplies through `IRepositoryReader`. It receives no host path, OpenAI credential, environment variable, network client, or runtime process. It does not execute TypeScript or resolve arbitrary imports. These constraints preserve deterministic, source-grounded behavior while deliberately leaving dynamic runtime semantics unresolved.

The [Runtime Compatibility Matrix](/compatibility/) remains authoritative. A focused specification or future design does not broaden this page until the canonical matrix and released implementation do.
