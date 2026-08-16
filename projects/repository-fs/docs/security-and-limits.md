---
title: Security and operational limits
description: Resource budgets, safe errors, sensitive directory mode, cancellation, and Node.js runtime support.
order: 30
---

# Security and operational limits

Filesystem content and names are untrusted. The reader validates closed option contracts, retains no caller-mutable configuration, follows no descendant symlink, executes no file, and exposes no host path through `IRepositoryReader` or its exceptions.

## Resource limits

| Limit            |     Default | Meaning                                              |
| ---------------- | ----------: | ---------------------------------------------------- |
| `maxEntries`     |    `100000` | Selected and synthesized entries, excluding the root |
| `maxFileBytes`   |   `8388608` | Maximum bytes for one captured regular file          |
| `maxCachedBytes` | `134217728` | Maximum committed plus reserved file bytes           |

Configured values must be positive safe integers. A limit breach fails with `RESOURCE_LIMIT_EXCEEDED`; inventory and capture are never truncated into a partial success.

## Error mapping

Malformed logical paths remain `RepositoryPathException`. Configuration, root, inventory, filesystem, resource, snapshot, and cancellation failures use `RepositorySourceException`. Stable access denial maps to `ACCESS_DENIED`; stable I/O failure maps to `SOURCE_UNAVAILABLE`; any failure that prevents coherence from being proven maps to `SNAPSHOT_CHANGED`.

Raw directory selection is a sensitive mode because it deliberately admits the whole eligible tree. It can expose credentials, caches, ignored files, dependencies, and build output to the consumer. The CLI therefore uses exact Git-derived paths instead of asking this package to infer repository policy.

## Runtime

The package supports Node.js `^22.11.0 || ^24.11.0` and uses Node filesystem primitives. It is not browser-compatible. Creation and every reader operation support cancellation; a creation signal does not remain attached to later operations.
