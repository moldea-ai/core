---
title: Boundaries and limitations
description: Unsupported APIs, source forms, inferred behavior, and the adapter security boundary.
order: 30
---

# Boundaries and limitations

The current verified target does not claim support for:

- JavaScript, Python, CommonJS, or other source languages and module forms
- beta Anthropic resources, `client.messages.stream`, parse helpers, or tool runners
- streaming semantics, even when direct `messages.create` uses a `stream` property
- provider/server tools as manifest client-tool registrations
- source factories, mutable relationship arrays, computed relationship properties, or indirect request values
- re-export, package-export, TypeScript path-alias, or compiler-driven module resolution
- agent input/output-schema, tool output-schema, or tool implementation evidence
- skills, variables, or runtime-native routing evidence

Unsupported Anthropic APIs are not rejected merely because direct Messages API calls are the verified target. Their presence does not become an available compatibility claim.

Package detection uses nearest manifests, not lockfiles or installed `node_modules`. Static dependency ranges are observations; the adapter does not prove which package build executes at runtime.

The adapter sees only entries Core supplies through `IRepositoryReader`. It receives no host path, credential, environment value, network client, or runtime process. It does not execute TypeScript or resolve arbitrary imports.

The [Runtime Compatibility Matrix](/compatibility/) remains authoritative.
