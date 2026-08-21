![moldea Google Gen AI adapter](cover.png)

# `@moldea.ai/adapter-google-genai`

Deterministic runtime evidence and diagnostics for direct Google Gen AI SDK integrations declared by `moldea` agents.

The package implements the official `google-genai` runtime adapter for `@moldea.ai/core`. It statically inspects explicitly bound repository source through Core's source-neutral reader. It never depends on, imports, initializes, or calls the Google Gen AI SDK; requires no API key or Google Cloud credentials; executes no repository code; and makes no network request.

## Supported target

Version `1.0.4` experimentally supports:

- Repository Format version `1`
- `@moldea.ai/core ^2.0.0`
- TypeScript ESM source
- npm `@google/genai >=2.17.1 <3.0.0`
- a named runtime value import of `GoogleGenAI` and a module-local `const` client
- a bound exported runtime-agent function containing direct `client.models.generateContent({ ... })` calls
- direct instruction-loader wiring through `config.systemInstruction`
- closed inline or immutable module-local tool, tool-container, function-declaration, and registration values through `config.tools[].functionDeclarations`
- direct input-schema wiring through `parametersJsonSchema`
- the SDK declaration's 128-scalar function-name rules and 512-declaration collection limit

Module bindings must remain lexically visible at every matched use. Dynamic requests, configuration, collections, computed properties, spreads, aliases, mutation, escapes, callable tools, and MCP conversion helpers remain unresolved rather than producing guessed negative diagnostics.

Function declarations require a static `name`, may include a static `description` and supported `parametersJsonSchema`, and tolerate `behavior`, `response`, and `responseJsonSchema` without interpreting them. The alternative `parameters` surface and unknown properties are unsupported. Static inline JSON-schema values may contain recursive strings, no-substitution templates, signed numbers, booleans, `null`, arrays without holes or spreads, and closed objects. The adapter proves binding relationships, not provider validity or business meaning.

The Runtime Compatibility Matrix is authoritative for current target maturity, exact versions, evidence, limits, patterns, and known limitations.

## Usage

```typescript
import { googleGenAiAdapter } from '@moldea.ai/adapter-google-genai';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [googleGenAiAdapter] });
```

The local CLI bundles active official adapters automatically. Applications composing Core directly register the immutable singleton explicitly.

## Public exports

The package exports only `googleGenAiAdapter`. It has no default export, mutable configuration, factory, parser, diagnostic registry, SDK facade, or cross-inspection state.

## Evidence and diagnostics

The verified target may emit `runtime-package`, `language`, `runtime-pattern`, `instruction-loader`, `tool-registration`, and `schema` evidence. Evidence is source-grounded and never contains repository source, instructions, schemas, credentials, client configuration, provider payloads, or model output.

See [Evidence and diagnostics](docs/evidence-and-diagnostics.md) for the complete stable catalog and cascade behavior.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/adapter-google-genai test
pnpm --filter @moldea.ai/adapter-google-genai typecheck
pnpm --filter @moldea.ai/adapter-google-genai lint
pnpm --filter @moldea.ai/adapter-google-genai build
```

Tests are colocated with their owning modules. Canonical conformance fixtures live under `/fixtures/adapter-google-genai`.
