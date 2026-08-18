---
title: Boundaries and limitations
description: Unsupported APIs, source forms, provider behavior, and the deterministic security boundary.
order: 30
---

# Boundaries and limitations

The current target does not claim support for:

- JavaScript, Python, CommonJS, or non-ESM source
- legacy `@google/generative-ai`
- `generateContentStream`, chats, live sessions, or the Interactions API
- callable tools, MCP conversion, automatic function execution, or provider/server tool relationships
- configuration or clients returned by factories
- arbitrary compiler resolution, path aliases, package exports, directory indexes, or re-export graphs
- alternative `FunctionDeclaration.parameters` schemas
- response-schema, tool-output-schema, or agent input/output-schema evidence
- backend, project, location, API version, authentication mode, model, contents, response, retry, or transport validation

Package detection uses nearest manifests rather than lockfiles or installed modules. Static dependency ranges are observations, not proof of an installed build. The adapter sees only Core-provided logical repository entries and never executes source, reads host files or environment variables, initializes tools, or contacts Google services.
