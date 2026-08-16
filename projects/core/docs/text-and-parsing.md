---
title: Text, manifests, and decisions
navigationTitle: Text and parsing
description: Normalization, digests, strict YAML parsing, manifest validation, and decision document semantics.
order: 10
---

# Text, manifests, and decisions

## Normalized text

Core accepts strict UTF-8 bytes or a Unicode-scalar JavaScript string. It removes one leading byte-order mark, converts CRLF and CR line endings to LF, rejects NUL and invalid Unicode, and performs no Unicode normalization. Results include normalized UTF-8 byte and Unicode-scalar lengths.

`calculateContentDigest` computes lowercase SHA-256 over the normalized UTF-8 bytes, so equivalent line endings produce the same digest while otherwise distinct Unicode sequences remain distinct.

```typescript
import { createCore } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

const core = createCore();
const result = await core.calculateContentDigest({
  content: new TextEncoder().encode('\ufeffline one\r\nline two\r'),
  path: parseRepositoryPath('/moldea/project.md'),
});
```

## Manifest parsing

`parseManifest` requires the canonical `/moldea/moldea.yaml` path and validates a complete Repository Format version 1 document. The parser uses the supported YAML 1.2 Core Schema subset and rejects directives, anchors, aliases, merge keys, custom tags, duplicate keys, unknown properties, invalid values, unrecognized official runtime IDs, and non-canonical relationships.

The operation does not read referenced files, check adapter availability, or prove that repository relationships exist. Those checks require complete repository inspection.

## Decision parsing

`parseDecision` validates the canonical timestamp-and-slug filename, strict YAML frontmatter, exact status and timestamp contracts, supersession references, and non-empty preserved Markdown body. Repository-wide duplicate IDs, graphs, and relationship state are resolved during project inspection rather than isolated document parsing.

Parsing results are all-or-nothing: a valid result contains its immutable value and no diagnostics; an invalid result contains ordered diagnostics and no partially trusted value.
