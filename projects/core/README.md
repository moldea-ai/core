# `@moldea.ai/core`

Source-neutral, deterministic interpretation of the `moldea` repository format.

The current `0.0.0` foundation accepts caller-supplied text documents and does not access a
filesystem, Git provider, or network. Invalid document content produces stable diagnostics, while
invalid configuration and operational failures use typed exceptions. Manifest parsing, decision
parsing, and repository inspection through `IRepositoryReader` will be exposed as their behavioral
slices are implemented.

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

## Development

From the monorepo root:

```bash
pnpm exec turbo run typecheck --filter=@moldea.ai/core
pnpm exec turbo run build --filter=@moldea.ai/core
pnpm exec turbo run test --filter=@moldea.ai/core
```

Unit and integration tests are colocated with their source. Repository-level fixtures use the
immutable reader from `@moldea.ai/repository/memory`.
