# Core canonical discovery fixtures

These fixtures exercise version 1 canonical `/moldea/**` discovery through the immutable `@moldea.ai/repository/memory` reader.

- `valid-project.json` contains a populated canonical inventory in deliberately noncanonical input order.
- `invalid-layouts.json` contains missing-foundation, wrong-type, symlink, and unrecognized-path cases with exact expected discovery diagnostics.

The discovery slice does not expose `inspectProject`. Its inventory composes with the cross-file validation and provisional-index cases under `fixtures/core/project-index`; framework-adapter execution and the public inspection boundary remain deferred.
