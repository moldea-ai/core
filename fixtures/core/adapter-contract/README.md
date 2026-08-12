# Core runtime-adapter contract fixtures

These fixtures exercise Core's source-neutral adapter invocation boundary through `@moldea.ai/repository/memory`.

- `cases.json` owns the universally valid repository snapshot used by fake conforming adapters.
- `evidence.expected.json` owns the exact normalized, deduplicated evidence sequence.
- `diagnostics.expected.json` owns the exact normalized adapter-diagnostic sequence that makes the final project invalid without discarding evidence.

Adapter implementations live in the colocated Core integration suite because executable callbacks are not repository-format fixture data.
