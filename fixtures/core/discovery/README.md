# Core canonical discovery fixtures

These fixtures exercise version 1 canonical `/moldea/**` discovery through the immutable `@moldea.ai/repository/memory` reader.

- `valid-project.json` contains a populated canonical inventory in deliberately noncanonical input order.
- `invalid-layouts.json` contains missing-foundation, wrong-type, symlink, and unrecognized-path cases with exact expected discovery diagnostics.

The discovery slice does not expose `inspectProject`. Cross-file relationships, decision supersession graphs, placeholders, mirrors, adapter execution, and final project indexing are covered by later repository-inspection fixtures.
