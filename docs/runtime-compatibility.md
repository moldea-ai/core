> **Generated file. Do not edit directly. Canonical source: `/compatibility/runtimes.yaml`.**

Matrix format version: `1`

The matrix publishes only the verified targets and support boundaries shown below.

| Adapter ID          | Owning package                         | Implementation | Distribution | Implementation range | Status      | Runtime guidance | Verified targets |
| ------------------- | -------------------------------------- | -------------- | ------------ | -------------------- | ----------- | ---------------- | ---------------: |
| `anthropic`         | `@moldea.ai/adapter-anthropic`         | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `claude-agent-sdk`  | `@moldea.ai/adapter-claude-agent-sdk`  | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `cloudflare-agents` | `@moldea.ai/adapter-cloudflare-agents` | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `custom`            | `@moldea.ai/core`                      | `built-in`     | `public`     | —                    | `available` | `required`       |              `1` |
| `eve`               | `@moldea.ai/adapter-eve`               | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `google-genai`      | `@moldea.ai/adapter-google-genai`      | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `langchain`         | `@moldea.ai/adapter-langchain`         | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `langgraph`         | `@moldea.ai/adapter-langgraph`         | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `openai`            | `@moldea.ai/adapter-openai`            | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `openai-agents-sdk` | `@moldea.ai/adapter-openai-agents-sdk` | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `pydantic-ai`       | `@moldea.ai/adapter-pydantic-ai`       | `package`      | `public`     | —                    | `planned`   | —                |              `0` |
| `vercel-ai-sdk`     | `@moldea.ai/adapter-vercel-ai-sdk`     | `package`      | `public`     | —                    | `planned`   | —                |              `0` |

## Adapter: `custom`

- Owning package: `@moldea.ai/core`
- Implementation range: —
- Supported repository-format versions: `1`
- Compatible Core range: `^1.0.0`
- Runtime guidance: `required`
- Last verified: `2026-08-13`

Runtime guidance notes: Project-local guidance defines the custom runtime integration.

### Target: `custom`

- Kind: `custom`
- Support level: `supported`
- Language: `any`
- Evidence kinds: —
- Last verified: `2026-08-13`

#### Patterns

| Kind      | Pattern                             | Support | Description                                                                                        | Notes |
| --------- | ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------- | ----- |
| `runtime` | `explicit-repository-relationships` | `full`  | Universal Core validation of explicit repository relationships without runtime-specific inference. | —     |
