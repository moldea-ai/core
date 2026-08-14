# Repository reader fixtures

These source-neutral fixtures exercise the shared `IRepositoryReader` contract. They describe
logical repository entries rather than host filesystem state and are maintained by
`projects/repository`.

- `valid-snapshot.json` contains the baseline immutable snapshot used by the conformance suite.
- `invalid-memory-definitions.json` contains construction failures specific to the baseline
  in-memory reader.

File content is represented as either Unicode scalar text or an explicit byte array. JSON escaped
unpaired surrogates are intentional invalid-input fixtures and must never be encoded with lossy
replacement.
