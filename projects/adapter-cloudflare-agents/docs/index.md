---
title: Cloudflare Agents adapter
description: Package contract, integration model, and public surface.
order: 0
---

# Cloudflare Agents adapter

`@moldea.ai/adapter-cloudflare-agents` is the official source-neutral adapter for the `cloudflare-agents` runtime id. It implements `IRuntimeAdapter`, supports Repository Format version `1`, and exposes only `cloudflareAgentsAdapter`.

The adapter inspects TypeScript source through the repository reader supplied by Core. It does not execute source, load Cloudflare packages, inspect `node_modules`, use credentials, or make network requests. Runtime applications register the singleton with `createCore({ adapters: [cloudflareAgentsAdapter] })`; the local CLI registers active official adapters automatically.

The [Runtime Compatibility Matrix](/compatibility/) is authoritative. This documentation explains the package behavior but does not expand the verified target boundary.
