# Core manifest fixtures

These fixtures exercise document-level `@moldea.ai/core` manifest parsing. They contain no host paths, credentials, runtime values, or source-provider state and require no repository reads.

- `valid-minimal.yaml` is the smallest version 1 manifest.
- `valid-complete.yaml` exercises every version 1 manifest field.
- `valid-complete.expected.json` is the normalized JSON representation of the complete manifest.
- `invalid-cases.json` defines representative strict-YAML and schema failures with their expected diagnostic codes.
