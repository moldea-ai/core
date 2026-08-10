# `@moldea.ai/core`

Source-neutral, deterministic interpretation of the `moldea` repository format.

The current `0.0.0` foundation accepts caller-supplied text documents and does not access a filesystem, Git provider, or network. Invalid document content produces stable diagnostics, while invalid configuration and operational failures use typed exceptions. Strict version 1 manifest parsing is available now; decision parsing and repository inspection through `IRepositoryReader` remain reserved for later behavioral slices.

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

## Development

From the monorepo root:

```bash
pnpm exec turbo run typecheck --filter=@moldea.ai/core
pnpm exec turbo run build --filter=@moldea.ai/core
pnpm exec turbo run test --filter=@moldea.ai/core
```

Unit and integration tests are colocated with their source. Repository-level fixtures use the
immutable reader from `@moldea.ai/repository/memory`.
