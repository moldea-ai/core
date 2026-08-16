---
title: Git working-tree source model
navigationTitle: Working-tree source
description: Git-aware inventory, repository discovery, guarded content, symlink handling, and snapshot stabilization.
order: 20
---

# Git working-tree source model

Git determines the absolute top-level working-tree root for the selected starting directory. Ordinary repositories, unborn repositories, nested invocation directories, and linked worktrees use this same discovery path. Bare repositories, Git-directory-only paths, sparse checkouts, malformed Git output, and unsupported versions fail before inventory begins.

## Inventory

The CLI reads NUL-delimited tracked index records plus non-ignored untracked records using fixed, non-interactive Git commands. It validates modes, stages, object identifiers, UTF-8 paths, nested ownership, and exact logical-path grammar before constructing the reader.

Submodule roots and their descendants are excluded. Untracked content owned by a nested repository is excluded. Missing candidates are omitted, while contradictory index stages, tracked/untracked collisions, unsupported types, unsafe paths, or ambiguous ownership fail atomically.

## Symlinks and content transforms

Native symlinks remain symlinks. When `core.symlinks=false`, tracked Git symlinks materialized as regular host files are overlaid as logical symlinks and never read as content.

The CLI classifies effective `filter`, `working-tree-encoding`, and `ident` attributes without executing filters, Git LFS, clean or smudge commands, or encoding helpers. A guarded regular file remains visible in the inventory but fails if Core requests its bytes, using the safe `git:GIT_CONTENT_TRANSFORM_UNSUPPORTED` contract.

## Stabilization

The selected working-tree, worktree Git directory, and common Git directory are pinned by host identity. Each attempt compares complete normalized inventories around exact-path reader construction and runs Core only when they agree. Snapshot-related failures retry the whole provisional operation up to three total attempts; no provisional bytes or results are reused.

An unstable tree produces retryable `cli:WORKING_TREE_UNSTABLE`. The CLI never exposes selected host paths, raw process errors, Git stderr, or rejected values in its public errors.
