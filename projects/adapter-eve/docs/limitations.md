---
title: Limitations
description: Conservative boundaries of the initial Eve adapter target.
order: 30
---

# Limitations

The initial target intentionally excludes dynamic agents and capabilities, configuration-free roots, positive single-file-subagent analysis, JavaScript and non-`.ts` parsing, arbitrary compiler resolution, remote agents, extensions, connections, channels, schedules, hooks, state, sessions, auth, and runtime execution.

Known alternate authored module extensions participate only in collision preflight. Their contents are not read. Flat and packaged Markdown skills may establish an implementation path but do not establish runtime registration. Schema contents, model identifiers, provider configuration, tool side effects, approval behavior, and semantic description quality are not validated.

When an unsupported source could replace, rename, compose, or collide with a relationship, the adapter returns no optimistic evidence and suppresses contradiction diagnostics that would require guessing Eve's effective runtime state.
