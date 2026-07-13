# Tasks: MCP Gateway Proxy

## Task Dependency Graph

```
T1 (scaffold)
├── T2 (config types)
│   ├── T3 (utils)
│   │   ├── T4 (config paths)
│   │   │   ├── T5 (config loader + imports)
│   │   │   ├── T6 (metadata cache)
│   │   │   │   └── T7 (tool metadata)
│   │   │   ├── T8 (auth store)
│   │   │   │   └── T9 (OAuth flow)
│   │   │   └── T10 (npx resolver)
│   │   │       └── T11 (server manager) ←── T9
│   │   │           └── T12 (lifecycle manager)
│   │   │               └── T13 (lazy connect)
│   │   ├── T14 (output guard)
│   │   └── T15 (tool registrar)
│   ├── T16 (proxy actions) ←── T7, T11, T13, T14, T15, T9
│   ├── T17 (direct tools) ←── T7, T11, T13, T14, T15
│   ├── T18 (proxy tool + dispatch) ←── T16, T17
│   └── T19 (state) ←── T11, T12, T5
│       └── T20 (MCP server + handlers) ←── T18, T19, T16, T17
│           └── T21 (CLI) ←── T20, T5
│               └── T22 (tests)
│                   └── T23 (README)
```

---

## T1: Project Scaffolding
**Priority**: P1
**Depends on**: —
**Reuses**: pi-mcp-adapter `package.json` structure (adapted)

**What**: Create the project skeleton — `package.json`, `tsconfig.json`, directory structure, `.gitignore`, binary entry point stub.

**Where**:
- `package.json` — dependencies, scripts, bin entry, files list
- `tsconfig.json` — TypeScript config (ESM, Node 20+, strict)
- `bin/mcp-tool-search.js` — shebang entry
- `src/` — directory structure per design.md
- `.gitignore` — node_modules, dist, cache files
- `vitest.config.ts` — test config

**Done when**:
- `npm install` succeeds
- `npx tsc --noEmit` passes with no errors (empty src files OK)
- Directory structure matches design.md
- `package.json` has bin entry pointing to `bin/mcp-tool-search.js`
- No `@earendil-works/*` dependencies

---

## T2: Config Types
**Priority**: P1
**Depends on**: T1
**Reuses**: pi-mcp-adapter `types.ts` (generic portions)

**What**: Define all TypeScript types/interfaces for config, MCP tools, resources, content, and utility functions (`getServerPrefix`, `formatToolName`, `isToolExcluded`).

**Where**:
- `src/config/types.ts` — `McpConfig`, `ServerEntry`, `McpSettings`, `ImportKind`, `OAuthConfig`, `McpOutputGuardSettings`, `McpTool`, `McpResource`, `McpContent`, `ContentBlock`, `ToolMetadata`, `DirectToolSpec`, `ServerProvenance` + `getServerPrefix`, `formatToolName`, `isToolExcluded`

**Done when**:
- All types compile with no errors
- `ServerEntry` matches pi-mcp-adapter's shape exactly (all fields)
- `getServerPrefix`, `formatToolName`, `isToolExcluded` functions work correctly
- No `@earendil-works/*` imports — `ContentBlock` defined locally as `{ type: "text" | "image"; text?: string; data?: string; mimeType?: string }`
- No UI types (UiStreamMode, UiHostContext, etc.)

---

## T3: Utils
**Priority**: P1
**Depends on**: T1
**Reuses**: pi-mcp-adapter `utils.ts`, `abort.ts`, `logger.ts`

**What**: Implement utility functions — abort signal helpers, logger (stderr-only), env interpolation, parallelLimit, truncateAtWord, resolveBearerToken, formatAuthRequiredMessage.

**Where**:
- `src/utils/abort.ts` — `throwIfAborted(signal?)`, `abortable(promise, signal?)`
- `src/utils/logger.ts` — `Logger` class, `logger` singleton (stderr-only, `MCP_TOOL_SEARCH_DEBUG=1`)
- `src/utils/env.ts` — `interpolateEnvVars(value)`, `interpolateEnvRecord(values)`, `resolveConfigPath(value)`
- `src/utils/utils.ts` — `parallelLimit(items, limit, fn)`, `truncateAtWord(text, target)`, `resolveBearerToken(definition)`, `formatAuthRequiredMessage(config, serverName, default)`, `getConfigFromArgv()` (parse `--config` arg)

**Done when**:
- `throwIfAborted` throws with signal reason when aborted
- `abortable` races promise against signal, rejects on abort
- Logger writes only to `process.stderr` (never `process.stdout`)
- `interpolateEnvVars` replaces `${VAR}` and `$env:VAR` patterns
- `resolveConfigPath` expands `~` to home dir
- `parallelLimit` respects concurrency limit
- `resolveBearerToken` reads `bearerToken` (interpolated) or `bearerTokenEnv`
- All unit tests pass

---

## T4: Config Paths
**Priority**: P1
**Depends on**: T2
**Reuses**: pi-mcp-adapter `config.ts` path logic (adapted)

**What**: Implement path resolution for config files, data directory, and host-specific config file discovery.

**Where**:
- `src/config/paths.ts` — `getDataDir()`, `getConfigPaths()`, `getHostConfigPath(kind)`, `IMPORT_PATHS` table

**Done when**:
- `getDataDir()` returns `~/.config/mcp-tool-search/` (or `MCP_TOOL_SEARCH_DATA_DIR` override)
- Config file precedence: `~/.config/mcp/mcp.json` → `~/.config/mcp-tool-search/mcp.json` → `.mcp.json` → `.mcp-tool-search.json`
- `getHostConfigPath("cursor")` returns `~/.cursor/mcp.json`
- `getHostConfigPath("claude-code")` tries `~/.claude/mcp.json`, `~/.claude.json`, `~/.claude/claude_desktop_config.json`
- `getHostConfigPath("codex")` returns `~/.codex/config.json`
- `getHostConfigPath("vscode")` returns `.vscode/mcp.json` (project-relative)
- `getHostConfigPath("windsurf")` returns `~/.windsurf/mcp.json`
- `getHostConfigPath("claude-desktop")` returns macOS path
- All paths support `~` expansion
- Unit tests pass for all path resolutions

---

## T5: Config Loader + Imports
**Priority**: P1
**Depends on**: T2, T4
**Reuses**: pi-mcp-adapter `config.ts` (loadMcpConfig, mergeConfigs, expandImports)

**What**: Implement config loading with multi-file precedence, deep merge, and host-specific import expansion.

**Where**:
- `src/config/config.ts` — `loadMcpConfig(overridePath?, cwd?)`, `mergeConfigs(...)`, `getConfigSources(overridePath?, cwd?)`
- `src/config/imports.ts` — `expandImports(config, cwd?)`, `loadHostConfig(kind, cwd?)`, `findAvailableImportConfigs(cwd?)`

**Done when**:
- `loadMcpConfig` merges all config sources in precedence order
- Per-server merge is shallow (higher precedence overrides individual fields)
- `settings` is shallow-merged (later wins)
- `imports` is unioned across sources
- `expandImports` loads host configs for each `ImportKind` in `imports`
- User-defined `mcpServers` in the same file take precedence over imported servers
- Host configs support both `mcpServers` and `mcp-servers` field names
- Missing config files are silently skipped (no crash)
- `findAvailableImportConfigs` returns which host configs exist on disk
- Unit tests with mock config files pass

---

## T6: Metadata Cache
**Priority**: P1
**Depends on**: T2, T3, T4
**Reuses**: pi-mcp-adapter `metadata-cache.ts`

**What**: Implement disk-based metadata cache for tool metadata — load, save, hash validation, reconstruction.

**Where**:
- `src/cache/metadata-cache.ts` — `loadMetadataCache()`, `saveMetadataCache(cache)`, `computeServerHash(definition)`, `isServerCacheValid(entry, definition, maxAgeMs?)`, `reconstructToolMetadata(serverName, entry, prefix, definition)`, `serializeTools(tools)`, `serializeResources(resources)`

**Done when**:
- Cache file path: `~/.config/mcp-tool-search/cache.json`
- `saveMetadataCache` does atomic write (tmp + rename), merge-then-write (single-server update doesn't clobber others)
- `computeServerHash` SHA-256 hashes stable fields (command, args, env interpolated, cwd resolved, url, headers interpolated, auth, bearerToken resolved, bearerTokenEnv, exposeResources, excludeTools) — excludes lifecycle, idleTimeout, requestTimeoutMs, debug
- `isServerCacheValid` checks hash match + age (default 7 days)
- `reconstructToolMetadata` rebuilds `ToolMetadata[]` from cached data
- `CACHE_VERSION = 1`
- Unit tests pass (hash computation, validity check, save/load round-trip)

---

## T7: Tool Metadata
**Priority**: P1
**Depends on**: T2, T6
**Reuses**: pi-mcp-adapter `tool-metadata.ts`

**What**: Implement tool metadata building from MCP server tools/resources, schema formatting, and tool name lookup.

**Where**:
- `src/cache/tool-metadata.ts` — `buildToolMetadata(tools, resources, definition, serverName, prefix)`, `getToolNames(state, serverName)`, `findToolByName(metadata, toolName)`, `formatSchema(schema, indent?)`

**Done when**:
- `buildToolMetadata` processes each MCP tool: filters excluded, applies `formatToolName` prefix, builds `ToolMetadata`
- If `exposeResources !== false`: creates synthetic `get_<resource_name>` tools with `resourceUri`
- Returns `{ metadata: ToolMetadata[], failedTools: string[] }`
- `findToolByName` normalizes hyphens to underscores for fuzzy matching
- `formatSchema` pretty-prints JSON Schema: `name (type) *required* [default: ...] - description` per property; handles anyOf/oneOf/items/nested/const/enum
- No UI resource URI extraction (no `@modelcontextprotocol/ext-apps`)
- Unit tests pass with sample MCP tool/resource arrays

---

## T8: Auth Store
**Priority**: P2
**Depends on**: T4
**Reuses**: pi-mcp-adapter `mcp-auth.ts`

**What**: Implement OAuth token storage — save, load, update, remove, with file permissions and URL binding.

**Where**:
- `src/auth/auth-store.ts` — `getAuthEntry(serverName)`, `getAuthForUrl(serverName, url)`, `saveAuthEntry(serverName, entry)`, `removeAuthEntry(serverName)`, `updateTokens(serverName, tokens)`, `updateClientInfo(serverName, info)`, `updateCodeVerifier(serverName, verifier)`, `updateOAuthState(serverName, state)`, `isTokenExpired(serverName)`, `hasStoredTokens(serverName)`

**Done when**:
- Storage path: `~/.config/mcp-tool-search/oauth/<sha256-hash>/tokens.json` (mode 0600, dir mode 0700)
- Stores: `accessToken`, `refreshToken`, `expiresAt`, `scope`, `clientInfo`, `codeVerifier`, `oauthState`, `serverUrl`
- `isTokenExpired` checks `expiresAt` with buffer
- URL change invalidates credentials (serverUrl mismatch)
- Atomic writes (tmp + rename)
- Unit tests pass (save/load/delete round-trip, expiry check, URL invalidation)

---

## T9: OAuth Flow
**Priority**: P2
**Depends on**: T8, T3
**Reuses**: pi-mcp-adapter `mcp-auth-flow.ts`, `mcp-oauth-provider.ts`, `mcp-callback-server.ts`

**What**: Implement OAuth 2.1 flow orchestration — start, complete, authenticate, with callback server and OAuth provider.

**Where**:
- `src/auth/oauth-flow.ts` — `startAuth(serverName, url, definition?)`, `completeAuthFromInput(serverName, input)`, `completeAuth(serverName, code)`, `authenticate(serverName, url, definition)`, `getValidToken(serverName)`, `getAuthStatus(serverName)`, `removeAuth(serverName)`, `extractOAuthConfig(definition)`, `supportsOAuth(definition)`, `parseAuthorizationCodeInput(input, expectedState)`, `initializeOAuth()`, `shutdownOAuth()`
- `src/auth/oauth-provider.ts` — `McpOAuthProvider` class (implements `OAuthClientProvider` from MCP SDK)
- `src/auth/callback-server.ts` — Local HTTP callback server on `localhost:<port>/callback`

**Done when**:
- `McpOAuthProvider` implements all `OAuthClientProvider` methods: `clientInformation`, `saveClientInformation`, `tokens`, `saveTokens`, `redirectToAuthorization`, `saveCodeVerifier`, `codeVerifier`, `saveState`, `state`, `invalidateCredentials`, `addClientAuthentication`, `prepareTokenRequest`
- `supportsOAuth` returns true if `url` set, `auth` not disabled, no custom headers
- `startAuth` returns `{ authorizationUrl }` — starts callback server, builds provider, gets auth URL
- `completeAuthFromInput` accepts raw code, `?code=...`, or full localhost URL
- `authenticate` runs full flow (start + callback wait + token save)
- `client_credentials` grant works headlessly (no browser)
- Callback server supports OS-assigned port (`port: 0`) and strict port
- `shutdownOAuth` closes callback server
- Client name default: `mcp-tool-search`
- Unit tests pass with mock OAuth endpoints

---

## T10: npx Resolver
**Priority**: P1
**Depends on**: T4, T3
**Reuses**: pi-mcp-adapter `npx-resolver.ts`

**What**: Implement npx binary resolution to skip the npm parent process (~143 MB savings per server start).

**Where**:
- `src/mcp/npx-resolver.ts` — `resolveNpxBinary(command, args)`, `NpxResolution` type

**Done when**:
- Parses `npx [...]` / `npm exec [...]` args (including `-p`, `--package`, `--`, `-y`)
- Looks up package in npm cache: `<npm-cache>/_npx/<hash>/node_modules/<pkg>/package.json`
- Follows `.bin/<name>` symlinks via `realpathSync` (falls back to `package.json` bin path)
- Detects JS files (extension or shebang with `node`) → `isJs: true`
- Cache resolutions in `~/.config/mcp-tool-search/npx-cache.json` (24h TTL)
- `forceNpxCache(pkgSpec)` runs `npm exec --yes --package <pkg> -- node -e 1` to populate cache
- Returns `{ binPath, extraArgs, isJs }` or `null` if not resolvable
- Unit tests pass (mock npm cache structure)

---

## T11: Server Manager
**Priority**: P1
**Depends on**: T2, T3, T10, T9
**Reuses**: pi-mcp-adapter `server-manager.ts`

**What**: Implement `McpServerManager` — the core class that manages downstream MCP server connections (stdio + HTTP + SSE + StreamableHTTP).

**Where**:
- `src/mcp/server-manager.ts` — `McpServerManager` class, `ServerConnection` interface
- `src/mcp/transport.ts` — Transport creation helpers (extracted from server-manager for clarity)

**Done when**:
- `connect(name, definition, signal?)` — dedupes concurrent connects via `connectPromises` Map, reuses healthy connections
- `createConnection` — creates `Client` + `Transport`, connects, fetches tools + resources (paginated)
- stdio: resolves npx, spawns with env/cwd/stderr handling
- HTTP: tries StreamableHTTP first (probe client), falls back to SSE on non-auth errors; does NOT fall back on `UnauthorizedError`
- Bearer tokens added to headers before transport creation
- OAuth: creates `McpOAuthProvider` for OAuth servers
- `UnauthorizedError` → returns `needs-auth` status (cleans up client + transport)
- `close(name)` — deletes from map before async cleanup (race safety), closes client + transport
- `closeAll()` — closes all connections in parallel
- `touch`, `incrementInFlight`, `decrementInFlight`, `isIdle(timeoutMs)` — lifecycle tracking
- `getRequestOptions(name, signal?)` — builds `RequestOptions` with signal + timeout
- `setSamplingConfig`, `setElicitationConfig` — stubs (no-op for standalone, or throw "not supported")
- `setDefaultRequestTimeoutMs` — normalizes timeout (> 0)
- No UI stream listeners, no URL elicitation completion handler
- Unit tests pass (mock transports, connect dedupe, idle check)

---

## T12: Lifecycle Manager
**Priority**: P1
**Depends on**: T11
**Reuses**: pi-mcp-adapter `lifecycle.ts`

**What**: Implement `McpLifecycleManager` — lazy/eager/keep-alive modes, idle timeout, health checks, auto-reconnect.

**Where**:
- `src/lifecycle/lifecycle.ts` — `McpLifecycleManager` class

**Done when**:
- `registerServer(name, definition, settings?)` — registers for health checks / idle tracking
- `markKeepAlive(name, definition)` — marks for auto-reconnect
- `setGlobalIdleTimeout(minutes)` — sets default idle timeout
- `startHealthChecks(intervalMs = 30000)` — `setInterval` with `.unref()`
- `checkConnections()` — for keep-alive: reconnect if dropped → `onReconnect(name)`; for lazy/eager: if `isIdle` → `close(name)` → `onIdleShutdown(name)`
- `getIdleTimeout` precedence: per-server `idleTimeout` → global → default 10 min; `eager` sets idle to 0 (never auto-shutdown)
- `gracefulShutdown()` — clears interval + `manager.closeAll()`
- `setReconnectCallback`, `setIdleShutdownCallback` — for metadata cache updates
- Unit tests pass (mock manager, health check interval, idle disconnect)

---

## T13: Lazy Connect
**Priority**: P1
**Depends on**: T11, T12, T6
**Reuses**: pi-mcp-adapter `init.ts` (lazyConnect, getFailureAgeSeconds)

**What**: Implement the lazy connect primitive with failure backoff, and metadata update on connect.

**Where**:
- `src/lifecycle/lazy-connect.ts` — `lazyConnect(state, name, signal?)`, `getFailureAgeSeconds(state, name)`, `updateServerMetadata(state, name)`, `updateMetadataCache(state, name)`, `flushMetadataCache(state)`

**Done when**:
- `lazyConnect`: if `connected` → update metadata, return true; if `needs-auth` → return false; if failed < 60s ago → return false; else connect → update metadata + cache → return true; on failure set failureTracker
- `FAILURE_BACKOFF_MS = 60000` (60 seconds)
- `getFailureAgeSeconds` returns seconds since last failure (or null if no failure)
- `updateServerMetadata` rebuilds `toolMetadata` from live connection + updates cache
- `flushMetadataCache` writes current metadata to disk
- Unit tests pass (mock state, backoff logic, metadata update)

---

## T14: Output Guard
**Priority**: P1
**Depends on**: T2, T3
**Reuses**: pi-mcp-adapter `mcp-output-guard.ts`

**What**: Implement output truncation and spill-to-disk for oversized MCP tool results.

**Where**:
- `src/guard/output-guard.ts` — `guardMcpOutput(content, options?)`, `resolveMcpOutputGuardOptions(settings?)`, `guardedMcpDetails(guarded)`

**Done when**:
- Text output: 50 KiB / 2,000 lines max inline (`DEFAULT_MCP_OUTPUT_MAX_BYTES`, `DEFAULT_MCP_OUTPUT_MAX_LINES`)
- Over limit → head preview + truncation notice + temp file path (mode 0600, `os.tmpdir()`)
- Image content: pass through unchanged
- Details (`mcpResult` JSON): 16 KiB max raw (`DEFAULT_MCP_DETAILS_MAX_BYTES`); over → summary + temp file
- `resolveMcpOutputGuardOptions` reads `settings.outputGuard` + `MCP_OUTPUT_GUARD` env var (0/false/no/off = disabled)
- `guardedMcpDetails` spreads `mcpResult` + `outputGuard` if present
- Supports `prefix`, `suffix`, `emptyTextFallback` options
- Unit tests pass (text truncation, image passthrough, env kill switch, custom limits)

---

## T15: Tool Registrar
**Priority**: P1
**Depends on**: T2
**Reuses**: pi-mcp-adapter `tool-registrar.ts`

**What**: Implement MCP content transformation — convert MCP content blocks to gateway content blocks, resolve result content from `content` or `structuredContent`.

**Where**:
- `src/tools/tool-registrar.ts` — `transformMcpContent(content: McpContent[]): ContentBlock[]`, `resolveMcpResultContent(result): ContentBlock[]`

**Done when**:
- `text` → `{ type: "text", text }`
- `image` → `{ type: "image", data, mimeType }` (default `image/png`)
- `resource` → `{ type: "text", text: "[Resource: <uri>]\n<text or JSON>" }`
- `resource_link` → `{ type: "text", text: "[Resource Link: <name>]\nURI: <uri>" }`
- `audio` → `{ type: "text", text: "[Audio content: <mimeType>]" }`
- Unknown → JSON stringified
- `resolveMcpResultContent` pulls `content`, falls back to JSON-stringified `structuredContent` if `content` empty
- Unit tests pass (all content types, empty content fallback)

---

## T16: Proxy Actions
**Priority**: P1
**Depends on**: T7, T11, T13, T14, T15, T9
**Reuses**: pi-mcp-adapter `proxy-modes.ts`

**What**: Implement all proxy tool action handlers — search, describe, call, connect, list, status, auth-start, auth-complete.

**Where**:
- `src/tools/proxy-actions.ts` — `executeStatus(state)`, `executeSearch(state, query, regex?, server?, includeSchemas?)`, `executeDescribe(state, toolName)`, `executeList(state, server)`, `executeConnect(state, serverName, signal?)`, `executeCall(state, toolName, args?, serverOverride?, signal?)`, `executeAuthStart(state, serverName)`, `executeAuthComplete(state, serverName, input)`, `executeUiMessages(state)` (returns empty for standalone)

**Done when**:
- `executeStatus` returns server status with connection status + tool counts + failure age
- `executeSearch` supports substring (OR'd terms) and regex (with ReDoS safety via `recheck`)
- `executeSearch` max regex query length: 256 chars
- `executeDescribe` returns full description + formatted schema
- `executeList` returns tool list for a server (from cache or live)
- `executeConnect` connects + updates metadata + returns tool list; handles needs-auth + autoAuth
- `executeCall` resolves tool by name (with prefix matching fallback), lazy connects, handles needs-auth/autoAuth, calls tool or reads resource, guards output
- `executeCall` handles `UrlElicitationRequiredError` (returns "not supported" for standalone)
- `executeAuthStart` returns authorization URL with manual instructions
- `executeAuthComplete` completes OAuth from redirect URL or code
- All return MCP-compatible result: `{ content: ContentBlock[], details?: Record<string, unknown> }`
- No UI session logic (no `maybeStartUiSession`)
- Unit tests pass (mock state for each action)

---

## T17: Direct Tools
**Priority**: P3
**Depends on**: T7, T11, T13, T14, T15
**Reuses**: pi-mcp-adapter `direct-tools.ts`

**What**: Implement direct tool resolution and executor — promote specific tools as first-class MCP tools.

**Where**:
- `src/tools/direct-tools.ts` — `resolveDirectTools(config, cache, prefix, envOverride?)`, `getMissingConfiguredDirectToolServers(config, cache)`, `buildProxyDescription(config, cache, directSpecs)`, `createDirectToolExecutor(getState, getInitPromise, spec)`

**Done when**:
- `resolveDirectTools` processes servers with `directTools: true` or `directTools: ["..."]` or global `settings.directTools: true`
- Filters: skip excluded tools, skip collisions with `mcp` proxy tool name, skip cross-server duplicates (first wins)
- Returns `DirectToolSpec[]` with prefixed names + schemas
- `envOverride` from `MCP_DIRECT_TOOLS=server,server/tool` env var
- Per-server `directTools` overrides global `settings.directTools`
- `buildProxyDescription` generates multi-section description with usage examples + server overview
- `createDirectToolExecutor` returns async function: await init → lazyConnect → handle needs-auth/autoAuth → callTool/readResource → guard output → return result
- No UI session flow
- Return type: MCP `CallToolResult`-compatible `{ content: ContentBlock[], isError?: boolean }`
- Unit tests pass (resolution logic, filtering, executor with mock state)

---

## T18: Proxy Tool + Dispatch
**Priority**: P1
**Depends on**: T16, T17
**Reuses**: pi-mcp-adapter `index.ts` (proxy tool registration logic)

**What**: Implement the `mcp` proxy tool definition and dispatch logic — the single tool that routes to all proxy actions.

**Where**:
- `src/tools/proxy.ts` — `mcpToolDefinition` (name, description, inputSchema), `executeProxy(state, params, signal?)`

**Done when**:
- Tool name: `mcp`
- Tool description: from `buildProxyDescription` (includes usage examples + server overview)
- Input schema: `{ tool?, args?, connect?, describe?, search?, regex?, includeSchemas?, server?, action? }` (all optional strings/booleans)
- Dispatch priority: `action > tool (call) > connect > describe > search > server (list) > nothing (status)`
- `args` is parsed as JSON string → object (with error on invalid JSON)
- Returns MCP-compatible result
- Unit tests pass (dispatch routing for all action combinations)

---

## T19: State
**Priority**: P1
**Depends on**: T11, T12, T5
**Reuses**: pi-mcp-adapter `state.ts` (stripped)

**What**: Define the central `GatewayState` object that holds all runtime state.

**Where**:
- `src/state.ts` — `GatewayState` interface, `createGatewayState(config, dataDir)` factory

**Done when**:
- `GatewayState` contains: `manager: McpServerManager`, `lifecycle: McpLifecycleManager`, `toolMetadata: Map<string, ToolMetadata[]>`, `config: McpConfig`, `failureTracker: Map<string, number>`, `dataDir: string`, `openBrowser: (url: string) => Promise<void>`
- No UI fields (`uiResourceHandler`, `consentManager`, `uiServer`, `completedUiSessions`, `ui`, `sendMessage`)
- `openBrowser` uses the `open` package directly
- `createGatewayState` initializes manager + lifecycle + loads cache + reconstructs metadata
- Unit tests pass (state creation, metadata reconstruction from cache)

---

## T20: MCP Server + Handlers
**Priority**: P1
**Depends on**: T18, T19, T16, T17
**Reuses**: pi-mcp-adapter `index.ts` (concept — replace Pi hooks with MCP server)

**What**: Implement the MCP server setup with stdio transport, request handlers, and startup/shutdown lifecycle.

**Where**:
- `src/server.ts` — `startServer(config?, overridePath?)` main entry
- `src/handlers/list-tools.ts` — `handleListTools(state)` returns `ListToolsResult`
- `src/handlers/call-tool.ts` — `handleCallTool(state, request, signal)` returns `CallToolResult`

**Done when**:
- Server created with `new Server({ name: "mcp-tool-search", version: "..." }, { capabilities: { tools: {} } })`
- Transport: `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
- `ListToolsRequest` handler returns: `mcp` proxy tool (unless `disableProxyTool` and direct tools cover everything) + direct tools from cache
- `CallToolRequest` handler dispatches: if `mcp` → `executeProxy`; if direct tool → `createDirectToolExecutor`; else error
- Startup: load config → load cache → create state → register servers with lifecycle → connect eager/keep-alive in parallel → start health checks → connect transport
- Shutdown (SIGINT/SIGTERM): clear health check interval → close all connections → flush cache → close callback server → transport.close()
- All log output to stderr
- Logs client info from `initialize` params for diagnostics
- E2E test: start server as subprocess, send `initialize` + `tools/list` + `tools/call`, verify JSON-RPC responses

---

## T21: CLI
**Priority**: P1
**Depends on**: T20, T5
**Reuses**: pi-mcp-adapter `cli.js`

**What**: Implement CLI entry point — argument parsing, `init` subcommand, default serve mode.

**Where**:
- `src/cli.ts` — main CLI entry
- `bin/mcp-tool-search.js` — shebang wrapper (`#!/usr/bin/env node`)

**Done when**:
- `mcp-tool-search` (no args) → starts MCP stdio server (default)
- `mcp-tool-search init` → scans for host configs, prints what was found, writes missing imports to `~/.config/mcp-tool-search/mcp.json`
- `mcp-tool-search init --dry-run` → prints what it would do without writing
- `mcp-tool-search --config <path>` → override config file path
- `mcp-tool-search --help` → prints usage
- `mcp-tool-search --version` → prints version
- Binary has correct shebang and is executable
- Unit tests pass (arg parsing, init dry-run output)

---

## T22: Tests
**Priority**: P1
**Depends on**: T20
**Reuses**: pi-mcp-adapter `__tests__/`

**What**: Write comprehensive test suite covering all modules.

**Where**:
- `__tests__/config.test.ts` — config loading, merge, imports
- `__tests__/metadata-cache.test.ts` — cache hash, validity, save/load
- `__tests__/tool-metadata.test.ts` — buildToolMetadata, formatSchema, findToolByName
- `__tests__/server-manager.test.ts` — connect dedupe, transport selection, close
- `__tests__/lifecycle.test.ts` — health checks, idle timeout, reconnect
- `__tests__/lazy-connect.test.ts` — backoff, metadata update
- `__tests__/output-guard.test.ts` — truncation, image passthrough, env switch
- `__tests__/proxy.test.ts` — search, describe, call, connect, status
- `__tests__/direct-tools.test.ts` — resolution, filtering, executor
- `__tests__/npx-resolver.test.ts` — package resolution
- `__tests__/auth-store.test.ts` — token storage, expiry, URL invalidation
- `__tests__/env.test.ts` — interpolation, path resolution

**Done when**:
- `npm test` runs all tests with vitest
- All tests pass
- Coverage ≥ 70% for core modules (config, cache, server-manager, lifecycle, proxy, output-guard)
- E2E test for MCP server over stdio passes

---

## T23: README
**Priority**: P1
**Depends on**: T20, T21

**What**: Write comprehensive README with installation, configuration, usage examples for each MCP client.

**Where**:
- `README.md`

**Done when**:
- Installation instructions (`npm install -g mcp-tool-search` or `npx mcp-tool-search`)
- Config file format documented (ServerEntry fields, settings, imports)
- Client configuration examples for: Cursor, Claude Code, Codex, VSCode, Windsurf, Claude Desktop
- Usage examples for all proxy actions (search, describe, call, connect, status, auth)
- Direct tools documentation
- Lifecycle modes documentation
- OAuth setup guide (manual flow)
- Output guard documentation
- Comparison with pi-mcp-adapter (what's included, what's not)
- Troubleshooting section (stderr logs, OAuth issues, connection failures)