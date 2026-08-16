---
title: Capture, cache, and concurrency
description: Verified lazy byte capture, cache accounting, cancellation, and permanent snapshot invalidation.
order: 20
---

# Capture, cache, and concurrency

The inventory is frozen at reader creation. On platforms with sufficiently strong metadata, a regular file is captured on its first read; Windows eagerly captures selected files before publishing the reader because available metadata cannot prove every same-size in-place change.

## Verified capture

A first read verifies the resolved root, every directory component, the open file handle, the current path, and the creation fingerprint. The reader reserves the exact frozen length before allocation, reads in bounded chunks, and verifies coherence again before committing bytes.

Only a complete verified capture enters the private cache. Oversized, truncated, replaced, redirected, cancelled, or otherwise changed reads commit nothing. Repeated successful reads perform no host access and return a fresh detached `Uint8Array` each time.

## Concurrency and cancellation

Concurrent first reads of the same path share one physical capture while each waiter remains independently cancellable. Cancelling one waiter does not cancel work still needed by another. Cancelling the final waiter abandons the capture, completes coherence-aware cleanup, and releases its reservation before a later attempt begins.

Different paths may capture concurrently. Reservation registration order owns cache capacity; completion timing cannot make committed plus in-flight bytes exceed `maxCachedBytes`.

## Permanent invalidation

The first `SNAPSHOT_CHANGED` failure permanently invalidates the shared reader state, aborts pending captures, clears cached bytes and reservations, and prevents any active or later operation from returning repository data. This fail-closed behavior prevents a reader from mixing bytes across source states. Recovery requires constructing and verifying a new reader.
