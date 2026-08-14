# Core decision fixtures

These fixtures exercise document-level `@moldea.ai/core` decision parsing. They contain no host paths, credentials, runtime values, or source-provider state and require no cross-file resolution.

- `1767225600000-adopt-core.md` is the smallest representative accepted decision.
- `1786131723456-use-postgresql.md` exercises every decision-frontmatter field.
- `valid-complete.expected.json` is the normalized JSON representation of the complete decision fields.
- `invalid-cases.json` defines representative path, delimiter, YAML, metadata, supersession, and body failures with their complete expected diagnostics, including messages, paths, pointers, scalar ranges, entities, normalized details, ordering, and source.
