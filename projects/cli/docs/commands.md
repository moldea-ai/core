---
title: Commands and options
description: Validate, inspect, and compatibility command behavior, resource options, and runtime requirements.
order: 10
---

# Commands and options

```text
moldea validate
moldea inspect
moldea compatibility
```

Top-level and command help, `moldea --version`, strict option parsing, and deterministic usage errors do not require repository access.

## `validate`

Validates the complete selected repository through Core and active runtime adapters. Human and JSON output contain ordered diagnostics but deliberately omit the project index, canonical content, and adapter evidence. Zero diagnostics produce `valid`; any diagnostics produce `invalid`.

## `inspect`

Runs the same snapshot and inspection path. Human output remains content-minimized and reports format and counts. `--json` includes the complete Core inspection result, including canonical normalized project content when valid. Treat captured inspect JSON as potentially confidential repository data.

## `compatibility`

Reports the installed CLI, package composition, Core formats, minimum Git version, matrix version, every official adapter, active state, and target data. It performs release-integrity validation but does not invoke Git, discover a repository, read client files, or use the network.

## Common inspection options

`validate` and `inspect` accept `--repository <path>`, `--json`, `--no-color`, and positive safe-integer overrides for `--max-entries`, `--max-file-bytes`, `--max-total-bytes`, `--max-manifest-bytes`, `--max-diagnostics`, and `--max-evidence`.

The default repository is the invocation directory. Relative repository selections resolve from that directory.

## Runtime requirements

The CLI supports Node.js `^22.11.0 || ^24.11.0`. `validate` and `inspect` require Git `2.30.0` or later and a usable non-sparse working tree. `compatibility`, help, version, and argument validation do not require Git.
