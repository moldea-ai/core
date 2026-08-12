# Core conformance fixtures

These fixtures are the repository-owned conformance data for `@moldea.ai/core`. Repository-level cases use the immutable `@moldea.ai/repository/memory` reader so Core behavior remains independent of filesystem, Git, host-path, and source-provider semantics.

| Fixture area              | Contract covered                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manifest/`               | Strict version 1 YAML and manifest parsing, normalized values, and complete document diagnostics.                                                                  |
| `decision/`               | Decision filenames, frontmatter, timestamps, bodies, supersession declarations, normalized values, and complete document diagnostics.                              |
| `discovery/`              | Canonical asset discovery, entry types, symlink rejection, and unknown canonical paths.                                                                            |
| `agent-assets/`           | Mandatory descriptions and instructions, optional handoff descriptions, identities, and runtime placeholders.                                                      |
| `runtime-guidance/`       | Referenced and discovered runtime guidance, empty content, missing content, and shared reads.                                                                      |
| `manifest-relationships/` | Global and agent context and decision relationships.                                                                                                               |
| `decision-graph/`         | Decision IDs, active and historical supersession, cycles, missing references, status consistency, and orphans.                                                     |
| `repository-references/`  | Exact bindings, repository references, implementation files, impact paths, wrong entry types, and symlinks.                                                        |
| `mirrors/`                | Exact mirror comparison after BOM and line-ending normalization, missing files, entry types, symlinks, and strict text failures.                                   |
| `project-index/`          | Complete public results, context-only projects, every tool and skill combination, all-or-nothing indexing, deterministic diagnostics, and exact index goldens.     |
| `adapter-contract/`       | Configured adapter selection, evidence and diagnostic normalization, mutation-isolated cached reads, deterministic execution, and all-or-nothing adapter behavior. |

Colocated Core unit suites own source-neutral cases that do not benefit from repository fixtures, including strict UTF-8 and Unicode handling, scalar counting, normalized SHA-256 values, logical paths and simple globs, YAML scalar semantics, placeholder scanning, diagnostic construction and ordering, resource limits, cancellation, and public type compatibility.

The configured adapter fixtures exercise Core's common adapter boundary without distinguishing package provenance. Concrete official adapters must reuse `adapter-contract/` and add their runtime-specific fixtures when those packages are implemented.

The repository CI matrix runs the same test boundary on Linux, macOS, and Windows.
