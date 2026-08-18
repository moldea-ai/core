# Google Gen AI adapter fixtures

These fixtures exercise the initial `typescript-models-generate-content-2` target through the real Core adapter boundary and `@moldea.ai/repository/memory`.

- `cases.json` owns one complete supported direct Google Gen AI `models.generateContent` integration.
- `evidence.expected.json` owns its exact normalized evidence.
- `diagnostics.expected.json` owns the complete stable code-and-message catalog.
- Focused variants are derived from the valid fixture by the colocated adapter integration tests. They cover nested request and configuration closure, supported and dynamic tool collections, function-declaration shapes and provider limits, static schema relationships, cascade suppression, symbol states, package ranges, cancellation, determinism, and concurrency.

No fixture imports, executes, installs, or contacts the Google Gen AI SDK, Gemini, Google Cloud, or an MCP server.
