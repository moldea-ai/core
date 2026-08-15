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
| `openai`            | `@moldea.ai/adapter-openai`            | `package`      | `public`     | `^1.0.0`             | `available` | `recommended`    |              `1` |
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

## Adapter: `openai`

- Owning package: `@moldea.ai/adapter-openai`
- Implementation range: `^1.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^1.0.0`
- Runtime guidance: `recommended`
- Last verified: `2026-08-15`

Runtime guidance notes: Document project-specific model selection, tool execution, streaming, retry, and error behavior that static inspection cannot establish.

### Target: `typescript-responses-api-7`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-15`

| Ecosystem | Package  | Role      | Verified range   |
| --------- | -------- | --------- | ---------------- |
| `npm`     | `openai` | `primary` | `>=7.4.0 <8.0.0` |

#### Binding support

| Subject              | Relationship | Symbol |
| -------------------- | ------------ | ------ |
| `runtime-agent`      | `full`       | `full` |
| `instruction-loader` | `full`       | `full` |
| `tool-registration`  | `full`       | `full` |
| `tool-input-schema`  | `full`       | `full` |

#### Patterns

| Kind                 | Pattern                          | Support     | Description                                                                                                                  | Notes |
| -------------------- | -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ----- |
| `instruction-loader` | `direct-instruction-loader`      | `full`      | A bound loader is called directly, optionally through await, by a Responses request instructions property.                   | —     |
| `runtime`            | `chat-completions`               | `ambiguous` | Chat Completions usage is outside this target and is not rejected merely because Responses is preferred.                     | —     |
| `runtime`            | `direct-responses-runtime-agent` | `full`      | A bound exported TypeScript function uses a module-local OpenAI client for one or more direct closed Responses API requests. | —     |
| `runtime`            | `dynamic-source-indirection`     | `ambiguous` | Factories, computed properties, spreads, mutable arrays, and indirect request values are not resolved.                       | —     |
| `schema`             | `direct-tool-input-schema`       | `full`      | A bound tool input schema is referenced directly by function-tool parameters.                                                | —     |
| `tool`               | `static-function-tools`          | `full`      | Bound static OpenAI function-tool objects are included in a closed inline or immutable module-local Responses tools array.   | —     |

#### Known limitations

- Agent input and output schemas, tool implementations and output schemas, skills, variables, and runtime-native routing do not produce evidence.
- JavaScript, CommonJS, Python, Realtime, Assistants, Agents SDK, streaming semantics, and provider-hosted configuration are not interpreted.
- Only TypeScript ESM files with supported direct default and relative named imports are interpreted.
- Package versions are classified from nearest package manifests; lockfiles and installed node_modules are not inspected.
