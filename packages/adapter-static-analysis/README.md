# `@moldea.ai/adapter-static-analysis`

Private, provider-neutral static-analysis primitives shared by Moldea runtime adapters.

This package owns normalized text and Unicode-scalar handling, nearest package-manifest discovery with optional manifest-package identity, strict dependency-range classification, provider-neutral TypeScript module indexing, lexical binding resolution, direct client-call analysis, relationship classification, immutable module-value and mutation analysis, exact static strings across relative named imports, and operation-local inspection caches.

It does not depend on public Moldea projects, define provider diagnostics, or form part of any public adapter contract. Public adapters bundle the implementation and retain their own Core, Repository, evidence, diagnostic, and provider-contract boundaries.
