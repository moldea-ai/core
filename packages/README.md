# Shared internal packages

Every immediate directory under this path is a private implementation package shared by multiple first-class projects.

Internal packages are introduced progressively after genuine cross-project reuse exists. They remain private, must not depend on first-class projects, participate in an acyclic dependency graph, and must not leak into the runtime resolution or generated declarations of a published package.

`@moldea.ai/adapter-static-analysis` owns the provider-neutral text, Unicode-scalar, package-discovery, TypeScript binding, request-call, relationship-classification, immutable module-value, and inspection-session primitives shared by the Anthropic, Claude Agent SDK, Cloudflare Agents, Eve, Google Gen AI, LangChain, LangGraph, OpenAI, OpenAI Agents SDK, and Vercel AI SDK adapters. Provider registration shapes, evidence, and diagnostics remain owned by each public adapter.
