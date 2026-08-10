# Core decision-graph fixtures

These fixtures exercise repository-level decision parsing and cross-file supersession validation through the immutable `@moldea.ai/repository/memory` reader.

- `cases.json` defines canonical decision candidates and exact expected graph diagnostics.
- Decision Markdown is generated deterministically from each fixture's filename ID, status, and `supersedes` list unless an explicit invalid document is supplied.

This slice does not expose `inspectProject`. Manifest and agent decision relationships, final project indexing, resource read caching, and adapter execution remain covered by later repository-inspection fixtures.
