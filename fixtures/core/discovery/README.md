# Core canonical discovery fixtures

These fixtures exercise version 1 canonical `/moldea/**` discovery through the immutable `@moldea.ai/repository/memory` reader.

- `valid-project.json` contains a populated canonical inventory in deliberately noncanonical input order.
- `invalid-layouts.json` contains missing-foundation, wrong-type, symlink, and unrecognized-path cases with exact expected discovery diagnostics.

The focused discovery suite remains internal, while its inventory composes with cross-file validation and provisional indexing under `fixtures/core/project-index`. Public `inspectProject` coverage and runtime-adapter composition live under `fixtures/core/adapter-contract` and their colocated integration suites.
