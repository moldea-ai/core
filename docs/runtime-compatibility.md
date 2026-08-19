> **Generated file. Do not edit directly. Canonical source: `/compatibility/runtimes.yaml`.**

Matrix format version: `1`

The matrix publishes only the verified targets and support boundaries shown below.

| Adapter ID          | Owning package                         | Implementation | Distribution | Implementation range | Status      | Runtime guidance | Verified targets |
| ------------------- | -------------------------------------- | -------------- | ------------ | -------------------- | ----------- | ---------------- | ---------------: |
| `anthropic`         | `@moldea.ai/adapter-anthropic`         | `package`      | `public`     | `^2.0.0`             | `available` | `optional`       |              `1` |
| `claude-agent-sdk`  | `@moldea.ai/adapter-claude-agent-sdk`  | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |
| `cloudflare-agents` | `@moldea.ai/adapter-cloudflare-agents` | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |
| `custom`            | `@moldea.ai/core`                      | `built-in`     | `public`     | Not available        | `available` | `required`       |              `1` |
| `eve`               | `@moldea.ai/adapter-eve`               | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |
| `google-genai`      | `@moldea.ai/adapter-google-genai`      | `package`      | `public`     | `^1.0.3`             | `available` | `optional`       |              `1` |
| `langchain`         | `@moldea.ai/adapter-langchain`         | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |
| `langgraph`         | `@moldea.ai/adapter-langgraph`         | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |
| `openai`            | `@moldea.ai/adapter-openai`            | `package`      | `public`     | `^2.0.0`             | `available` | `recommended`    |              `1` |
| `openai-agents-sdk` | `@moldea.ai/adapter-openai-agents-sdk` | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |
| `vercel-ai-sdk`     | `@moldea.ai/adapter-vercel-ai-sdk`     | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |

## Adapter: `anthropic`

- Owning package: `@moldea.ai/adapter-anthropic`
- Implementation range: `^2.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-17`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers or unsupported indirect integration patterns.

### Target: `typescript-messages-api-0-117`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-17`

| Ecosystem | Package             | Role      | Verified range       |
| --------- | ------------------- | --------- | -------------------- |
| `npm`     | `@anthropic-ai/sdk` | `primary` | `>=0.117.1 <0.118.0` |

#### Binding support

| Subject              | Relationship | Symbol |
| -------------------- | ------------ | ------ |
| `runtime-agent`      | `full`       | `full` |
| `instruction-loader` | `full`       | `full` |
| `tool-registration`  | `full`       | `full` |
| `tool-input-schema`  | `full`       | `full` |

#### Patterns

| Kind                 | Pattern                        | Support       | Description                                                                                                        | Notes         |
| -------------------- | ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- |
| `instruction-loader` | `direct-system-loader`         | `full`        | A directly bound instruction loader supplies the top-level system request property.                                | Not available |
| `runtime`            | `direct-messages-create`       | `full`        | Direct Anthropic Messages API invocation through a module-local client in a directly exported TypeScript function. | Not available |
| `runtime`            | `dynamic-request-construction` | `ambiguous`   | Dynamically assembled Messages requests cannot be mapped reliably without semantic analysis.                       | Not available |
| `schema`             | `direct-tool-input-schema`     | `full`        | A bound tool input schema is referenced directly through the client tool input_schema property.                    | Not available |
| `tool`               | `closed-client-tool-array`     | `full`        | Closed inline or immutable module-local arrays contain statically declared Anthropic client tools.                 | Not available |
| `tool`               | `provider-server-tools`        | `unsupported` | Anthropic provider or server tools are outside the initial client-tool target.                                     | Not available |

#### Provider limits

| Subject     | Limit              | Kind      | Value                   | Description                                                                                         | Reference                                          |
| ----------- | ------------------ | --------- | ----------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `tool-name` | `client-tool-name` | `pattern` | `^[A-Za-z0-9_-]{1,64}$` | Anthropic client-tool names match the complete ASCII letter, digit, underscore, and hyphen pattern. | Anthropic Messages API reference for client tools. |

#### Known limitations

- Arbitrary compiler resolution, path aliases, directory indexes, package exports, and re-export graphs are not resolved.
- Beta resources, client.messages.stream, parse helpers, and tool-runner abstractions are not interpreted; an exact stream property on direct messages.create requests is tolerated, but its semantics are not validated.
- Client-tool input-schema contents, including the provider-required top-level type object, are not validated; the target establishes only direct schema wiring.
- Source forms outside the verified TypeScript ESM target, dynamic factories, mutable requests, provider tools, output schemas, runtime variables, and handoffs are outside the initial target.

## Adapter: `custom`

- Owning package: `@moldea.ai/core`
- Implementation range: Not available
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `required`
- Last verified: `2026-08-15`

Runtime guidance notes: Project-local guidance defines the custom runtime integration.

### Target: `custom`

- Kind: `custom`
- Support level: `supported`
- Language: `any`
- Evidence kinds: Not available
- Last verified: `2026-08-15`

#### Patterns

| Kind      | Pattern                             | Support | Description                                                                                        | Notes         |
| --------- | ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------- | ------------- |
| `runtime` | `explicit-repository-relationships` | `full`  | Universal Core validation of explicit repository relationships without runtime-specific inference. | Not available |

## Adapter: `google-genai`

- Owning package: `@moldea.ai/adapter-google-genai`
- Implementation range: `^1.0.3`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-19`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers or unsupported indirect integration patterns.

### Target: `typescript-models-generate-content-2`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package         | Role      | Verified range    |
| --------- | --------------- | --------- | ----------------- |
| `npm`     | `@google/genai` | `primary` | `>=2.17.1 <3.0.0` |

#### Binding support

| Subject              | Relationship | Symbol |
| -------------------- | ------------ | ------ |
| `runtime-agent`      | `full`       | `full` |
| `instruction-loader` | `full`       | `full` |
| `tool-registration`  | `full`       | `full` |
| `tool-input-schema`  | `full`       | `full` |

#### Patterns

| Kind                 | Pattern                             | Support       | Description                                                                                                                             | Notes         |
| -------------------- | ----------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `instruction-loader` | `direct-config-system-instruction`  | `full`        | A directly bound instruction loader supplies config.systemInstruction in a closed generate-content request.                             | Not available |
| `runtime`            | `direct-models-generate-content`    | `full`        | Direct Google Gen AI models.generateContent invocation through a module-local client in a directly exported TypeScript function.        | Not available |
| `runtime`            | `dynamic-request-or-config`         | `ambiguous`   | Dynamically assembled requests or configuration cannot be mapped reliably without semantic analysis.                                    | Not available |
| `runtime`            | `streaming-chat-live-interactions`  | `unsupported` | Streaming generation, chat sessions, live sessions, and Interactions API calls are outside the initial direct generate-content target.  | Not available |
| `schema`             | `alternative-parameters-schema`     | `unsupported` | FunctionDeclaration.parameters and its OpenAPI-style Schema representation are outside the initial JSON-schema target.                  | Not available |
| `schema`             | `direct-parameters-json-schema`     | `full`        | A bound tool input schema is referenced directly through the function declaration parametersJsonSchema property.                        | Not available |
| `tool`               | `callable-and-mcp-tools`            | `unsupported` | Callable tools, MCP conversion helpers, and automatic tool execution are outside the initial static function-declaration target.        | Not available |
| `tool`               | `closed-function-declaration-tools` | `full`        | Closed inline or immutable module-local collections expose statically declared functions through config.tools and functionDeclarations. | Not available |
| `tool`               | `provider-server-tools`             | `unsupported` | Google-hosted or provider/server tools do not establish version 1 repository-local manifest tool relationships.                         | Not available |

#### Provider limits

| Subject     | Limit                        | Kind                  | Value                         | Description                                                                                                                   | Reference                                        |
| ----------- | ---------------------------- | --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `other`     | `function-declaration-count` | `other`               | `512`                         | The Google Gen AI SDK Tool contract permits at most 512 function declarations in each closed functionDeclarations collection. | Google Gen AI SDK Tool reference.                |
| `tool-name` | `function-name-length`       | `max-unicode-scalars` | `128`                         | The Google Gen AI SDK FunctionDeclaration contract limits function names to 128 Unicode scalar values.                        | Google Gen AI SDK FunctionDeclaration reference. |
| `tool-name` | `function-name-pattern`      | `pattern`             | `^[A-Za-z_][A-Za-z0-9_.:-]*$` | The Google Gen AI SDK FunctionDeclaration contract uses the documented ASCII leading and continuation character set.          | Google Gen AI SDK FunctionDeclaration reference. |

#### Known limitations

- Arbitrary compiler resolution, path aliases, directory indexes, package exports, subpath imports, and re-export graphs are not resolved.
- Backend-specific function-name restrictions are not validated; the published function-name rules cover only the version-matched SDK declaration contract.
- Constructor configuration, provider backend, API version, authentication mode, model selection, request contents, and response handling are not interpreted.
- Dynamic configuration, callable tools, MCP helpers, provider/server tools, automatic function execution, streaming, chats, live sessions, and Interactions API calls are outside the initial target.
- Function input-schema contents, including top-level object shape and parameter-name restrictions, are not validated; the target establishes only direct parametersJsonSchema wiring.
- Source forms outside the verified TypeScript ESM target, legacy @google/generative-ai, alternative parameters schemas, output schemas, runtime variables, and handoffs are outside the initial target.

## Adapter: `openai`

- Owning package: `@moldea.ai/adapter-openai`
- Implementation range: `^2.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `recommended`
- Last verified: `2026-08-17`

Runtime guidance notes: Document project-specific model selection, tool execution, streaming, retry, and error behavior that static inspection cannot establish.

### Target: `typescript-responses-api-7`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-17`

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

| Kind                 | Pattern                          | Support     | Description                                                                                                                                                             | Notes         |
| -------------------- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `instruction-loader` | `direct-instruction-loader`      | `full`      | A bound loader is called directly, optionally through await, by a Responses request instructions property.                                                              | Not available |
| `runtime`            | `chat-completions`               | `ambiguous` | Chat Completions usage is outside this target and is not rejected merely because Responses is preferred.                                                                | Not available |
| `runtime`            | `direct-responses-runtime-agent` | `full`      | A bound exported TypeScript function uses a module-local OpenAI client for one or more direct Responses API object-literal requests with relationship-specific closure. | Not available |
| `runtime`            | `dynamic-source-indirection`     | `ambiguous` | Factories, relationship-affecting computed properties and spreads, mutable arrays, and indirect request values remain unresolved.                                       | Not available |
| `schema`             | `direct-tool-input-schema`       | `full`      | A bound tool input schema is referenced directly by function-tool parameters.                                                                                           | Not available |
| `tool`               | `static-function-tools`          | `full`      | Bound static OpenAI function-tool objects with the supported exact fields are included in a closed inline or immutable module-local Responses tools array.              | Not available |

#### Known limitations

- Agent input and output schemas, tool implementations and output schemas, skills, variables, and runtime-native routing do not produce evidence.
- Only TypeScript ESM files with supported direct default and relative named imports are interpreted.
- Package versions are classified from nearest package manifests; lockfiles and installed node_modules are not inspected.
- Source forms outside the verified TypeScript ESM target, Realtime, Assistants, Agents SDK, streaming semantics, and provider-hosted configuration are not interpreted.
