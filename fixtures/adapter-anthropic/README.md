# Anthropic adapter fixtures

These fixtures exercise the initial `typescript-messages-api-7` target through the real Core adapter boundary and `@moldea.ai/repository/memory`.

- `cases.json` owns one complete supported direct Anthropic Messages integration.
- `evidence.expected.json` owns its exact normalized evidence.
- `diagnostics.expected.json` owns the complete stable code-and-message catalog.
- Focused variants are derived from the valid fixture by the colocated adapter integration tests. They assert each complete normalized diagnostic record and cover relationship-specific request closure, ordered spreads, tolerated FunctionTool fields, recursive static schemas, cascade suppression, multiple calls, ambiguous candidates, symbol states, collective package declarations, direct `await`, additional registrations, and safe or escaping module-local tool arrays.

No fixture imports, executes, installs, or contacts the Anthropic SDK.
