# Core universal project-index fixtures

These fixtures compose every universal version 1 repository-format phase through the immutable `@moldea.ai/repository/memory` reader.

- `cases.json` defines one complete project, independent content failures, and a manifest failure alongside phases that remain independently valid.
- `complete.expected.json` is the exact serialized provisional project-index golden.
- `diagnostics.expected.json` records complete deterministic diagnostic values for every case.
- The complete case includes project and focused context, runtime guidance, decisions, registered agents with an optional handoff description, relationships, repository references, unresolved requirements, and an exact instruction mirror.
- Invalid cases preserve all-or-nothing indexing while retaining deterministic, path-ordered diagnostics without dependent cascades.

The provisional index remains internal to Core. Framework-adapter execution, adapter evidence, and the public `inspectProject` operation are intentionally deferred.
