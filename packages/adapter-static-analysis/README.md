# `@moldea.ai/adapter-static-analysis`

Private, provider-neutral static-analysis primitives shared by Moldea runtime adapters.

This package owns normalized text and Unicode-scalar handling, nearest package-manifest discovery, strict dependency-range classification, TypeScript source indexing, lexical binding resolution, direct client-call analysis, provider-neutral relationship classification, immutable module-array analysis, and operation-local inspection caches.

It does not depend on public Moldea projects, define provider diagnostics, or form part of any public adapter contract. Public adapters bundle the implementation and retain their own Core, Repository, evidence, diagnostic, and provider-contract boundaries.
