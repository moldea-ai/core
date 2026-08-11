# `@moldea.ai/core`

Source-neutral, deterministic interpretation of the `moldea` repository format.

The current `0.0.1` public foundation accepts caller-supplied text documents and does not access a filesystem, Git provider, or network. Invalid document content produces stable diagnostics, while invalid configuration and operational failures use typed exceptions. Strict version 1 manifest and decision parsing are available now. Core also contains internal deterministic canonical-discovery and decision-graph layers exercised only through `IRepositoryReader` and `@moldea.ai/repository/memory`; public repository inspection remains reserved until the complete all-or-nothing behavior is implemented.

## Public entry points

- `@moldea.ai/core` exposes Core construction, results, diagnostics, limits, and exceptions.
- `@moldea.ai/core/format` exposes repository-format value types.
- `@moldea.ai/core/adapter` exposes the framework-adapter inspection contract.

## Text normalization and digests

```typescript
import { createCore } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

const core = createCore();
const input = {
  content: new TextEncoder().encode('\ufeffline one\r\nline two\r'),
  path: parseRepositoryPath('/moldea/project.md'),
};

const normalized = core.normalizeText(input);
const digested = await core.calculateContentDigest(input);
```

Normalization validates strict UTF-8 or Unicode-scalar string input, removes one leading byte-order
mark, converts CRLF and CR line endings to LF, rejects NUL, performs no Unicode normalization, and
reports normalized UTF-8 byte and scalar lengths. Digests are SHA-256 over the normalized UTF-8
bytes.

## Manifest parsing

```typescript
import { createCore } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

const result = await createCore().parseManifest({
  content: new TextEncoder().encode('version: 1\n'),
  path: parseRepositoryPath('/moldea/moldea.yaml'),
});
```

Manifest parsing validates the canonical path, strict UTF-8 and normalized text, the supported YAML 1.2 Core Schema subset, and every version 1 rule that can be established from the document alone. It rejects directives, anchors, aliases, merge keys, custom tags, duplicate keys, unknown properties, invalid values, unavailable configured framework adapters, and non-canonical relationships. A result includes both the normalized manifest asset and deeply immutable manifest value only when the complete document is valid. It does not read the repository or check whether referenced files exist.

## Decision parsing

```typescript
import { createCore } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

const result = await createCore().parseDecision({
  content: [
    '---',
    'status: accepted',
    'createdAt: "2026-08-07T19:42:03.456Z"',
    '---',
    'Use the accepted implementation.',
    '',
  ].join('\n'),
  path: parseRepositoryPath('/moldea/decisions/1786131723456-use-postgresql.md'),
});
```

Decision parsing validates the canonical timestamp-slug path, exact frontmatter delimiters, strict YAML metadata, status, canonical UTC `createdAt`, filename timestamp equality, supersession IDs, and non-empty Markdown body. A valid result preserves the exact normalized body and complete normalized asset, sorts supersession IDs, and includes a SHA-256 digest. It does not read other decisions or validate reference existence, duplicate IDs across files, supersession graphs, status consistency, or manifest relationships.

## Internal repository validation

Core's repository-level foundation composes canonical discovery with exact decision reads through `IRepositoryReader`. It parses each discovered decision once and deterministically validates project-wide ID uniqueness, missing supersession references, cycles, active and historical status consistency, and orphaned superseded decisions. Invalid or ambiguous decision nodes do not produce dependent graph cascades, while unrelated trustworthy graph rules continue to run.

The internal relationship layer also validates top-level and per-agent context and decision paths against canonical discovery and the parsed decision graph. Context targets must exist, and decision targets must exist and be accepted. Discovery and document diagnostics retain ownership of invalid targets so dependent missing or inactive diagnostics do not cascade.

Core now also contains internal readers for every discovered runtime-guidance file and for convention-owned registered-agent assets. Runtime guidance is normalized, digested, checked for non-whitespace content, and reconciled with each agent's optional framework guidance path. Registered agents are reconciled with exact directories, mandatory descriptions and instructions, optional handoff descriptions, Unicode-whitespace-trimmed description limits, forbidden runtime-variable delimiters, and opening instruction identity. Unregistered directories and missing registered assets produce deterministic diagnostics without rereading unregistered content or cascading from discovery-owned failures.

These layers remain intentionally internal. Runtime placeholders, relationship bindings and impact paths, mirrors, final project indexing, adapter execution, and the public `inspectProject` operation remain deferred until universal repository validation can produce one complete trustworthy project index.

## Development

From the monorepo root:

```bash
pnpm exec turbo run typecheck --filter=@moldea.ai/core
pnpm exec turbo run build --filter=@moldea.ai/core
pnpm exec turbo run test --filter=@moldea.ai/core
```

Unit and integration tests are colocated with their source. Repository-level fixtures use the
immutable reader from `@moldea.ai/repository/memory`.
