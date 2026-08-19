---
title: Boundaries and limitations
description: Unsupported SDK surfaces, source forms, dynamic behavior, and the adapter security boundary.
order: 30
---

# Boundaries and limitations

The current verified target does not claim support for:

- JavaScript, Python, CommonJS, or source outside the verified TypeScript ESM boundary
- indirect query wrappers, query input variables, nested callback calls, or unstable session APIs
- filesystem-defined agents, built-in agents, observer agents, or dynamically assembled definitions
- query main-thread `agent` selection or `toolAliases` interpretation
- string-array system prompts, CLAUDE.md, settings, hooks, plugins, skills, or prompt transformations
- programmatic-subagent output schemas or manifest tool output schemas
- per-agent MCP server configuration
- external stdio, SSE, HTTP, remote, proxy, plugin, provider-hosted, or built-in tools
- SDK server instructions as canonical Moldea instruction-loader content
- arbitrary compiler resolution, `tsconfig` path aliases, directory indexes, package exports, or re-export graphs
- runtime-generated strings, SDK key normalization, schema-content validation, permission evaluation, or provider behavior

Package detection uses nearest manifests, not lockfiles or installed `node_modules`. Static dependency ranges are observations; the adapter does not prove which package build executes at runtime.

The adapter sees only repository entries Core supplies through `IRepositoryReader`. It receives no host path, Anthropic credential, environment variable, network client, or runtime process. It does not execute TypeScript, dynamically import source, load the inspected SDK, or follow source symlinks.

The [Runtime Compatibility Matrix](/compatibility/) remains authoritative. A focused specification or future design does not broaden this page until the canonical matrix and released implementation do.
