---
title: Repository access
navigationTitle: Overview
description: Source-neutral, read-only repository contracts and an immutable in-memory reference reader.
order: 0
---

# Repository access without source assumptions

`@moldea.ai/repository` defines the smallest public boundary through which `moldea` code can observe a repository snapshot. It gives callers portable logical paths, exact entry metadata, exact file bytes, cancellation, and a stable operational exception model without assuming a filesystem, Git host, archive, or network protocol.

The package exists so every source implementation can present the same reader contract while Core remains source-neutral. `@moldea.ai/repository-fs` implements the contract for an explicitly selected local directory; Core consumes the contract to interpret `moldea` content; the CLI composes both.

## What it owns

- root-absolute logical repository paths and their validation
- exact file, directory, and symlink entry types
- the asynchronous `IRepositoryReader` contract
- source-operation and path-validation exceptions
- an immutable in-memory reader for fixtures and already-fetched snapshots

## What it deliberately does not own

The package does not access a filesystem or network, discover repositories, follow symlinks, decode file content, interpret the `moldea` format, apply Git ignore rules, or expose writes. A source implementation decides how a coherent snapshot is obtained; a consumer such as Core decides what the bytes mean.

## Entry points

- `@moldea.ai/repository` exports the reader, entry, path, and exception contracts.
- `@moldea.ai/repository/memory` exports the immutable reference reader.

Use the generated [API reference](./api/) for the exact exported surface.
