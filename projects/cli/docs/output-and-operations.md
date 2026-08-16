---
title: Output and operations
description: JSON envelopes, statuses, exit codes, safe errors, cancellation, read-only behavior, and release integrity.
order: 30
---

# Output and operations

## JSON envelope

`--json` writes one deterministic version 1 envelope to standard output. Envelopes identify the command, source, status, result or safe error, and schema version. No command mixes a partial success result with an operational error.

`validate` minimizes content. `inspect` preserves the complete Core result and can therefore contain project descriptions, context, decisions, runtime guidance, agent instructions, and other canonical content. Downstream systems must protect that output as repository data.

## Status and exit codes

| Outcome                                   | Status                       |               Exit code |
| ----------------------------------------- | ---------------------------- | ----------------------: |
| Completed valid inspection                | `valid`                      |                     `0` |
| Completed structurally invalid inspection | `invalid`                    |                     `1` |
| Invocation or operational error           | `error`                      | `2` or `3`, by contract |
| `SIGINT` before output completes          | no completed result required |                   `130` |
| `SIGTERM` before output completes         | no completed result required |                   `143` |

`compatibility` succeeds with `valid` and never uses `invalid`. A contradictory installed release fails with `cli:COMPATIBILITY_STATE_INVALID` and exit code `3`.

## Safe operational errors

Known repository and Core exceptions retain their source, code, retryability, safe logical path when applicable, and non-confidential metadata. Git and CLI errors use a closed stable registry. Unexpected failures become `cli:INTERNAL_ERROR` without raw causes, stack traces, host paths, or process diagnostics.

## Cancellation and read-only guarantees

One operation-scoped abort signal reaches Git processes, inventory, filesystem reader creation, repository reads, Core, and adapters. A signal discards an unwritten provisional result and stops further snapshot retries.

The executable does not modify the working tree, index, configuration, attributes, submodules, filters, or runtime environment. Before command work, release-integrity checks compare installed package identities, exact versions, dependency declarations, active adapters, Core formats, and generated compatibility metadata so a contradictory installation cannot report a misleading result.
