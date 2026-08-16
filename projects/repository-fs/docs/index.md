---
title: Filesystem repository reader
navigationTitle: Overview
description: A fail-closed Node.js reader for an explicitly selected local directory and coherent immutable snapshot.
order: 0
---

# A filesystem snapshot behind the common reader contract

`@moldea.ai/repository-fs` exposes an explicitly selected local directory through `IRepositoryReader`. It maps host entries to portable logical paths, verifies one coherent snapshot, lazily captures exact file bytes where the platform permits, and permanently fails closed if later verification proves that snapshot was lost.

The package is intentionally Git-agnostic. The CLI owns repository discovery, Git-aware inventory, nested-repository policy, and content-transform guards, then supplies an exact path selection to this reader.

## Responsibilities

- canonicalize and pin one explicit absolute root
- build either an exact-path or recursive-directory inventory
- exclude entries named exactly `.git`
- classify entries without following symlinks or junctions
- verify snapshot identity and file fingerprints
- enforce entry, file, and cache resource limits
- coordinate concurrent, independently cancellable reads
- map filesystem failures to source-neutral repository exceptions

## Boundaries

The reader does not discover Git roots, parse ignore rules, decide tracked state, execute filters, interpret repository content, traverse symlinks, or expose host paths. Recursive selection can include ignored files, dependencies, caches, credentials, and generated output; callers needing a narrower trust boundary should construct an exact logical-path inventory.

Use the generated [API reference](./api/) for exact exports and [Selection and snapshots](./selection-and-snapshots/) for the source model.
