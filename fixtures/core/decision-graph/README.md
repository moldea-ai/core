# Core decision-graph fixtures

These fixtures exercise repository-level decision parsing and cross-file supersession validation through the immutable `@moldea.ai/repository/memory` reader.

- `cases.json` defines canonical decision candidates and exact expected graph diagnostics.
- Decision Markdown is generated deterministically from each fixture's filename ID, status, and `supersedes` list unless an explicit invalid document is supplied.

The focused graph suite remains internal, while its parsed graph composes with manifest relationships, shared-session reads, and provisional indexing under `fixtures/core/project-index`. Public `inspectProject` coverage and framework-adapter composition live under `fixtures/core/adapter-contract` and their colocated integration suites.
