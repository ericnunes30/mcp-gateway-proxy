# Design: MCP Gateway Proxy

## Architecture Overview

The MCP Gateway Proxy is a standalone MCP server (stdio transport) that acts as a gateway/proxy to multiple downstream MCP servers. It replaces the Pi extension API layer of `pi-mcp-adapter` with the MCP SDK's server-side API, while reusing the entire downstream connection management, config, cache, auth, and lifecycle infrastructure.

```
┌──────────────────────────────────────────────────────────┐
│  MCP Client (Cursor / Claude Code / Codex / VSCode)       │
│  connects via stdio MCP protocol                          │
└──────────────────────────┬───────────────────────────────┘
                           │ JSON-RPC over stdio
                           ▼
┌──────────────────────────────────────────────────────────┐
│                  mcp-tool-search (gateway)                │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ MCP Server   │  │ Config       │  │ Metadata Cache   │ │
│  │ (stdio)      │  │ Loader       │  │ (disk: JSON)     │ │
│  │              │  │ (multi-file) │  │                  │ │
│  │ Tools:       │  │ + imports    │  │ SHA-256 hash     │ │
│  │  - mcp proxy │  │  (cursor,    │  │ per-server       │ │
│  │  - direct    │  │   claude,    │  │ 7-day max age    │ │
│  │    tools     │  │   codex...)  │  │                  │ │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘ │
│         │                                                │
│  ┌──────┴─────────────────────────────────────────────┐  │
│  │           Server Manager + Lifecycle                │  │
│  │  lazy/eager/keep-alive · idle timeout · health      │  │
│  │  connect dedupe · failure backoff · inFlight track  │  │
│  └──────┬──────────┬──────────┬──────────┬─────────────┘  │
│         │          │          │          │                  │
│  ┌──────┴───┐ ┌───┴────┐ ┌───┴────┐ ┌───┴────┐           │
│  │ OAuth    │ │ Output │ │ npx    │ │ Auth   │           │
│  │ Provider │ │ Guard  │ │Resolver│ │ Store  │           │
│  └──────────┘ └────────┘ └────────┘ └────────┘           │
└──────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ MCP srv │   │ MCP srv │   │ MCP srv │   │ MCP srv │
   │ (stdio) │   │ (HTTP)  │   │ (SSE)   │   │ (OAuth) │
   └─────────┘   └─────────┘   └─────────┘   └─────────┘
   Downstream MCP servers (managed via config JSON)
```

## Key Architectural Decisions

### ADR-1: Single `mcp` proxy tool vs. multiple meta-tools

**Decision**: Expose a single `mcp` proxy tool with action-based dispatch (matching pi-mcp-adapter), NOT separate `mcp_search`, `mcp_call`, `mcp_describe` tools.

**Rationale**: The entire point is minimal context footprint. One tool definition (~200 tokens) is better than 10 tool definitions (~2000 tokens). The agent learns the usage pattern from the tool description and discovers actions on-demand.

**Parameters**:
```typescript
{
  tool?: string,        // Call a tool
  args?: string,        // JSON string of arguments
  connect?: string,     // Connect to a server
  describe?: string,    // Describe a tool
  search?: string,      // Search tools
  regex?: boolean,      // Treat search as regex
  includeSchemas?: boolean, // Include schemas in search
  server?: string,      // Filter to server / disambiguate tool calls
  action?: string,      // Special actions: auth-start, auth-complete, ui-messages
}
```

**Dispatch priority**: `action > tool (call) > connect > describe > search > server (list) > nothing (status)`

### ADR-2: stdio-only server transport

**Decision**: The gateway exposes itself only via stdio MCP transport. No HTTP/SSE server mode for the gateway itself.

**Rationale**: All major MCP clients (Cursor, Claude Code, Codex, VSCode) support stdio. HTTP server mode adds complexity (port management, lifecycle) for marginal benefit. Downstream servers still support stdio + HTTP + SSE + StreamableHTTP.

### ADR-3: Reuse pi-mcp-adapter's config format verbatim

**Decision**: Use the exact same `ServerEntry`, `McpSettings`, and `McpConfig` schema as pi-mcp-adapter, including all extension fields (`lifecycle`, `idleTimeout`, `directTools`, `excludeTools`, `requestTimeoutMs`, etc.).

**Rationale**: The schema is a superset of standard MCP `mcpServers`. Any existing `.mcp.json` works without modification. Users migrating from pi-mcp-adapter keep their config.

### ADR-4: No Pi dependencies

**Decision**: Zero `@earendil-works/*` dependencies. Only `@modelcontextprotocol/sdk` + `typebox` + `zod` + `open` + `recheck`.

**Rationale**: The tool must be a standalone npm package installable by anyone, not tied to the Pi ecosystem.

### ADR-5: Logs to stderr only

**Decision**: All log output goes to `process.stderr`. Never `console.log` to stdout (which carries MCP JSON-RPC).

**Rationale**: stdio MCP transport uses stdout for JSON-RPC protocol messages. Any non-protocol output on stdout corrupts the stream and breaks the client connection.

### ADR-6: OAuth URL surfaced via tool result + stderr

**Decision**: When a server needs OAuth, the authorization URL is returned in the `mcp({ action: "auth-start" })` tool result AND printed to stderr. No automatic browser opening by default (`autoAuth: false`).

**Rationale**: In a stdio MCP server context, there's no direct UI. The agent (LLM) can present the URL to the user, or the user can find it in the client's stderr log. Manual completion via `mcp({ action: "auth-complete" })` works for remote/headless scenarios.

---

## Component Design

### 1. MCP Server (`src/server/`)

**Entry point**: `src/server.ts`

Creates an MCP `Server` instance with `StdioServerTransport` from `@modelcontextprotocol/sdk`. Registers request handlers for `ListToolsRequest` and `CallToolRequest`.

```
src/
  server.ts          # Server setup, transport, handlers registration
  handlers/
    list-tools.ts   # ListToolsRequest handler (returns proxy + direct tools)
    call-tool.ts    # CallToolRequest handler (dispatches to proxy or direct)
```

**`list-tools.ts`**:
- Returns the `mcp` proxy tool (unless `disableProxyTool` and all servers have direct tools from cache)
- Returns direct tools from metadata cache (for servers with `directTools` configured)
- Proxy tool description includes usage examples and server overview (from `buildProxyDescription`)

**`call-tool.ts`**:
- If tool name is `mcp` → dispatch to proxy handler (search/describe/call/connect/status/auth)
- If tool name matches a direct tool → dispatch to direct tool executor
- Both paths use the same `lazyConnect` + `executeCall` infrastructure

### 2. Config Loader (`src/config/`)

```
src/config/
  config.ts          # loadMcpConfig, merge, import expansion
  paths.ts           # Path resolution (data dir, config paths, host paths)
  types.ts           # McpConfig, ServerEntry, McpSettings, ImportKind
  imports.ts         # Host-specific config file discovery + loading
```

**Config file precedence** (lowest → highest):
1. `~/.config/mcp/mcp.json` (shared global — standard MCP)
2. `~/.config/mcp-tool-search/mcp.json` (tool-specific global override)
3. `.mcp.json` (project-local shared — standard MCP)
4. `.mcp-tool-search.json` (project-local override)

**Override path**: `MCP_TOOL_SEARCH_CONFIG` env var or `--config` CLI arg.

**Data directory**: `~/.config/mcp-tool-search/` (override: `MCP_TOOL_SEARCH_DATA_DIR` env var). Contains:
- `mcp.json` — tool-specific global config
- `cache.json` — metadata cache
- `oauth/` — OAuth token storage (per-server-hash subdirectories)
- `npx-cache.json` — npx resolution cache

**Host import paths** (same as pi-mcp-adapter):
| Import kind | Path(s) |
|---|---|
| `cursor` | `~/.cursor/mcp.json` |
| `claude-code` | `~/.claude/mcp.json`, `~/.claude.json`, `~/.claude/claude_desktop_config.json` |
| `claude-desktop` | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| `codex` | `~/.codex/config.json` |
| `windsurf` | `~/.windsurf/mcp.json` |
| `vscode` | `.vscode/mcp.json` (project-relative) |

All support `mcpServers` or `mcp-servers` field name.

### 3. Server Manager (`src/mcp/`)

Direct port of pi-mcp-adapter's `server-manager.ts`, stripped of UI stream listeners and URL elicitation completion handlers.

```
src/mcp/
  server-manager.ts   # McpServerManager class
  transport.ts       # stdio/HTTP/SSE/StreamableHTTP transport creation
  npx-resolver.ts    # npx binary resolution (skip npm parent)
```

**`McpServerManager`**:
- `connect(name, definition, signal?)` — dedupes concurrent connects via `connectPromises` Map, reuses healthy connections
- `createConnection(name, definition, signal?)` — creates Client + Transport, connects, fetches tools + resources
- `createHttpTransport(definition, serverName, signal?)` — StreamableHTTP first, SSE fallback (not on `UnauthorizedError`)
- `close(name)`, `closeAll()` — graceful cleanup
- `touch(name)`, `incrementInFlight(name)`, `decrementInFlight(name)` — lifecycle tracking
- `isIdle(name, timeoutMs)` — for idle timeout checks
- `getConnection(name)` — returns `ServerConnection` with status

**`ServerConnection`**:
```typescript
{
  client: Client;           // @modelcontextprotocol/sdk Client
  transport: Transport;    // stdio | StreamableHTTP | SSE
  definition: ServerEntry;
  tools: McpTool[];
  resources: McpResource[];
  lastUsedAt: number;
  inFlight: number;
  status: "connected" | "closed" | "needs-auth";
}
```

### 4. Lifecycle Manager (`src/lifecycle/`)

Direct port of pi-mcp-adapter's `lifecycle.ts`.

```
src/lifecycle/
  lifecycle.ts       # McpLifecycleManager class
  lazy-connect.ts    # lazyConnect() primitive + failure backoff
```

**`McpLifecycleManager`**:
- `registerServer(name, definition, settings?)` — registers for health checks / idle tracking
- `startHealthChecks(intervalMs = 30000)` — `setInterval` with `.unref()`
- `checkConnections()` — reconnect keep-alive servers, disconnect idle lazy servers
- `gracefulShutdown()` — clear interval + `manager.closeAll()`

**`lazyConnect(state, name, signal?)`**:
- If `connected` → update metadata, return true
- If `needs-auth` → return false (caller runs auth flow)
- If failed within 60s backoff → return false
- Else `manager.connect` → update metadata + cache + return true; on failure set failureTracker

### 5. Metadata Cache (`src/cache/`)

Direct port of pi-mcp-adapter's `metadata-cache.ts` and `tool-metadata.ts`.

```
src/cache/
  metadata-cache.ts  # Disk cache (load, save, hash, validity)
  tool-metadata.ts   # buildToolMetadata, findToolByName, formatSchema
```

**Cache file**: `~/.config/mcp-tool-search/cache.json`

**Cache structure**:
```typescript
{
  version: 1,
  servers: {
    "server-name": {
      hash: "sha256...",     // computeServerHash(definition)
      cachedAt: timestamp,
      tools: CachedTool[],
      resources: CachedResource[],
    }
  }
}
```

**`computeServerHash`** fields: `command`, `args`, `env` (interpolated), `cwd` (resolved), `url`, `headers` (interpolated), `auth`, `bearerToken` (resolved), `bearerTokenEnv`, `exposeResources`, `excludeTools`. Excludes volatile fields (`lifecycle`, `idleTimeout`, `requestTimeoutMs`, `debug`).

**Max age**: 7 days (`CACHE_MAX_AGE_MS`). Invalidated by hash mismatch or age.

**`buildToolMetadata(tools, resources, definition, serverName, prefix)`**:
- For each MCP tool: filter excluded → build `ToolMetadata` with prefixed name
- If `exposeResources !== false`: for each resource, build synthetic `get_<name>` tool with `resourceUri`
- Returns `{ metadata: ToolMetadata[], failedTools: string[] }`

**`findToolByName(metadata, toolName)`**:
- Normalizes hyphens to underscores for fuzzy matching
- Returns first match

### 6. Auth (`src/auth/`)

Direct port of pi-mcp-adapter's auth modules.

```
src/auth/
  auth-store.ts       # Token storage (getAuthEntry, saveAuthEntry, etc.)
  oauth-flow.ts       # startAuth, completeAuth, authenticate, supportsOAuth
  oauth-provider.ts   # McpOAuthProvider (implements OAuthClientProvider)
  callback-server.ts  # Local HTTP callback server for OAuth redirects
```

**Token storage**: `~/.config/mcp-tool-search/oauth/<sha256-hash>/tokens.json` (mode 0600, dir mode 0700). Keyed by server URL hash. Stores: `accessToken`, `refreshToken`, `expiresAt`, `scope`, `clientInfo`, `codeVerifier`, `oauthState`, `serverUrl` (for invalidation on URL change).

**OAuth flow**:
1. `UnauthorizedError` on connect → return `needs-auth` status
2. Agent calls `mcp({ action: "auth-start", server: "name" })`
3. Gateway starts callback server on `localhost` (OS-assigned port or `MCP_OAUTH_CALLBACK_PORT`)
4. Returns authorization URL (printed to stderr + in tool result)
5. User opens URL in browser, approves, browser redirects to localhost callback
6. Callback server receives code, completes flow
7. OR: user manually calls `mcp({ action: "auth-complete", server: "name", args: '{"redirectUrl":"..."}' })`
8. Tokens persisted to disk
9. Gateway retries connection

**`client_credentials` grant**: fully headless, no browser needed. Directly calls token endpoint.

### 7. Output Guard (`src/guard/`)

Direct port of pi-mcp-adapter's `mcp-output-guard.ts`.

```
src/guard/
  output-guard.ts    # guardMcpOutput, resolveMcpOutputGuardOptions
```

- Text output: 50 KiB / 2,000 lines max inline. Over → head preview + temp file path.
- Image content: pass through unchanged.
- Details (`mcpResult` JSON): 16 KiB max raw. Over → summary + temp file.
- Env kill switch: `MCP_OUTPUT_GUARD=0`
- Settings override: `outputGuard: { maxBytes, maxLines, detailsMaxBytes }`

### 8. Proxy Tool (`src/tools/`)

```
src/tools/
  proxy.ts           # buildProxyDescription, executeProxy (dispatch)
  direct-tools.ts    # resolveDirectTools, createDirectToolExecutor
  tool-registrar.ts  # transformMcpContent, resolveMcpResultContent
  proxy-actions.ts   # executeSearch, executeDescribe, executeCall, etc.
```

**`executeProxy` dispatch logic** (mirrors pi-mcp-adapter's `index.ts`):
```
action === "ui-messages" → executeUiMessages (no-op / empty for standalone)
action === "auth-start" → executeAuthStart
action === "auth-complete" → executeAuthComplete
params.tool → executeCall
params.connect → executeConnect
params.describe → executeDescribe
params.search → executeSearch
params.server → executeList
else → executeStatus
```

**`resolveDirectTools(config, cache, prefix)`**:
- For each server with `directTools: true` or `directTools: ["..."]` (or global `settings.directTools: true`):
- For each tool in cache: skip excluded, skip collisions with `mcp` proxy tool, skip cross-server duplicates
- Build `DirectToolSpec[]` with prefixed names and schemas

**`createDirectToolExecutor(spec)`**:
- Returns async function that: awaits init → lazyConnect → handles needs-auth/autoAuth → `client.callTool` or `client.readResource` → guard output → return result

### 9. Utils (`src/utils/`)

```
src/utils/
  abort.ts           # throwIfAborted, abortable
  logger.ts          # Logger class (stderr-only)
  env.ts             # interpolateEnvVars, interpolateEnvRecord, resolveConfigPath
  utils.ts           # parallelLimit, truncateAtWord, resolveBearerToken, etc.
```

**Logger**: All output to `process.stderr`. Env `MCP_TOOL_SEARCH_DEBUG=1` enables debug level.

### 10. CLI (`src/cli.ts`)

```
mcp-tool-search                    # Start MCP stdio server (default)
mcp-tool-search init [--dry-run]   # Scan host configs, write imports
mcp-tool-search --config <path>    # Override config file path
```

Binary entry: `bin/mcp-tool-search` → `src/cli.ts`

---

## Data Flow

### Startup Flow

```
1. Process starts (via npx or direct node)
2. Parse CLI args (init vs. serve, --config path)
3. Load config (loadMcpConfig) — merges all config files + imports
4. Load metadata cache (loadMetadataCache) from disk
5. Create McpServerManager + McpLifecycleManager
6. Register all servers with lifecycle
7. Reconstruct toolMetadata from cache for each server
8. Resolve direct tools from cache
9. Connect eager + keep-alive servers in parallel (limit 10)
10. For newly connected servers: buildToolMetadata → updateMetadataCache
11. Start health check interval (30s, unref'd)
12. Create MCP Server with StdioServerTransport
13. Register ListTools + CallTool handlers
14. Server.connect(transport) — ready for client
```

### Tool Call Flow (proxy)

```
1. Client sends tools/call { name: "mcp", arguments: { search: "screenshot" } }
2. CallTool handler → executeProxy
3. Parse params → dispatch to executeSearch
4. Search across all toolMetadata (from cache, no connections needed)
5. Return formatted results (tool names + descriptions + schemas)
```

### Tool Call Flow (direct tool)

```
1. Client sends tools/call { name: "chrome_take_screenshot", arguments: { format: "png" } }
2. CallTool handler → matches direct tool spec → createDirectToolExecutor
3. lazyConnect("chrome-devtools") if not connected
4. If needs-auth → return auth message
5. client.callTool({ name: "take_screenshot", arguments: { format: "png" } })
6. guardMcpOutput(result.content)
7. Return guarded content
```

### Lazy Connect Flow

```
1. Agent calls mcp({ tool: "chrome_take_screenshot", args: "{}" })
2. executeCall → find tool in toolMetadata → server = "chrome-devtools"
3. Check manager.getConnection("chrome-devtools")
4. If not connected → lazyConnect:
   a. Check failureTracker — if failed < 60s ago, return "server backoff"
   b. manager.connect("chrome-devtools", definition, signal)
   c. On success: buildToolMetadata → updateMetadataCache → return true
   d. On failure: failureTracker.set(name, Date.now()) → return false
5. If connected → client.callTool → guard output → return
```

### OAuth Flow

```
1. Agent calls mcp({ connect: "figma" })
2. manager.connect → StreamableHTTP transport → UnauthorizedError
3. Return "needs-auth" status
4. Agent calls mcp({ action: "auth-start", server: "figma" })
5. startAuth: create callback server, build OAuth provider, get authorization URL
6. Return URL (printed to stderr + in tool result)
7. User opens URL in browser → approves → browser redirects to localhost callback
8. Callback server receives code → completeAuth → save tokens to disk
   OR: user calls mcp({ action: "auth-complete", server: "figma", args: '{"redirectUrl":"..."}' })
9. Agent calls mcp({ connect: "figma" }) → connect succeeds with stored token
```

---

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.1",
    "open": "^10.2.0",
    "recheck": "^4.5.0",
    "typebox": "^1.1.24",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/open": "^6.2.1",
    "tsx": "^4.21.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

No `@earendil-works/*` dependencies. No `@modelcontextprotocol/ext-apps` (UI integration, not needed).

---

## Directory Structure

```
mcp-tool-search/
├── bin/
│   └── mcp-tool-search.js       # CLI entry (#!/usr/bin/env node)
├── src/
│   ├── server.ts                # MCP server setup + transport
│   ├── cli.ts                   # CLI arg parsing (init vs serve)
│   ├── config/
│   │   ├── config.ts            # loadMcpConfig, mergeConfigs
│   │   ├── paths.ts             # Data dir, config paths, host paths
│   │   ├── types.ts             # McpConfig, ServerEntry, McpSettings
│   │   └── imports.ts           # Host config discovery + loading
│   ├── mcp/
│   │   ├── server-manager.ts    # McpServerManager
│   │   ├── transport.ts         # Transport creation helpers
│   │   └── npx-resolver.ts      # npx binary resolution
│   ├── lifecycle/
│   │   ├── lifecycle.ts         # McpLifecycleManager
│   │   └── lazy-connect.ts      # lazyConnect + failure backoff
│   ├── cache/
│   │   ├── metadata-cache.ts    # Disk cache
│   │   └── tool-metadata.ts     # buildToolMetadata, formatSchema
│   ├── auth/
│   │   ├── auth-store.ts        # Token storage
│   │   ├── oauth-flow.ts        # OAuth flow orchestration
│   │   ├── oauth-provider.ts    # McpOAuthProvider
│   │   └── callback-server.ts   # Local HTTP callback
│   ├── guard/
│   │   └── output-guard.ts      # Output truncation + spill
│   ├── tools/
│   │   ├── proxy.ts             # Proxy tool + buildProxyDescription
│   │   ├── direct-tools.ts      # Direct tool resolution + executor
│   │   ├── tool-registrar.ts    # Content transformation
│   │   └── proxy-actions.ts     # executeSearch/Describe/Call/Connect/Status
│   ├── state.ts                 # GatewayState (manager, lifecycle, config, cache)
│   ├── handlers/
│   │   ├── list-tools.ts        # ListToolsRequest handler
│   │   └── call-tool.ts         # CallToolRequest handler
│   └── utils/
│       ├── abort.ts             # AbortSignal utilities
│       ├── logger.ts            # Logger (stderr-only)
│       ├── env.ts               # Env interpolation
│       └── utils.ts             # parallelLimit, truncateAtWord, etc.
├── __tests__/
│   ├── config.test.ts
│   ├── server-manager.test.ts
│   ├── metadata-cache.test.ts
│   ├── output-guard.test.ts
│   ├── proxy.test.ts
│   ├── direct-tools.test.ts
│   └── lifecycle.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Migration from pi-mcp-adapter

### Files to port (with modifications)

| pi-mcp-adapter file | New location | Changes |
|---|---|---|
| `types.ts` | `src/config/types.ts` | Remove UI types, replace `ContentBlock` with MCP-native type |
| `config.ts` | `src/config/config.ts` + `paths.ts` + `imports.ts` | Replace `agent-dir.ts` with `paths.ts`; drop RepoPrompt; drop diff preview |
| `server-manager.ts` | `src/mcp/server-manager.ts` | Remove UI stream listeners, URL elicitation completion |
| `lifecycle.ts` | `src/lifecycle/lifecycle.ts` | No changes (fully generic) |
| `metadata-cache.ts` | `src/cache/metadata-cache.ts` | Change cache path to data dir |
| `tool-metadata.ts` | `src/cache/tool-metadata.ts` | Remove UI resource URI extraction |
| `mcp-output-guard.ts` | `src/guard/output-guard.ts` | No changes (fully generic) |
| `npx-resolver.ts` | `src/mcp/npx-resolver.ts` | Change cache path |
| `tool-registrar.ts` | `src/tools/tool-registrar.ts` | No changes |
| `mcp-auth.ts` | `src/auth/auth-store.ts` | Change storage path |
| `mcp-auth-flow.ts` | `src/auth/oauth-flow.ts` | Replace `pi.exec` with `open` package |
| `mcp-oauth-provider.ts` | `src/auth/oauth-provider.ts` | Change client name default |
| `mcp-callback-server.ts` | `src/auth/callback-server.ts` | Update HTML copy |
| `proxy-modes.ts` | `src/tools/proxy-actions.ts` | Remove UI session logic; adapt return types |
| `direct-tools.ts` | `src/tools/direct-tools.ts` | Adapt return types to MCP `CallToolResult` |
| `utils.ts` | `src/utils/utils.ts` + `env.ts` | Remove `openUrl`/`openPath` (use `open` package) |
| `abort.ts` | `src/utils/abort.ts` | No changes |
| `logger.ts` | `src/utils/logger.ts` | Change env var; ensure stderr-only |
| `init.ts` | `src/server.ts` (startup) | Replace Pi extension hooks with MCP server bootstrap |
| `index.ts` | `src/server.ts` + `handlers/` | Replace `pi.registerTool` with MCP handlers |
| `state.ts` | `src/state.ts` | Strip UI fields |

### Files to NOT port

- `agent-dir.ts` (Pi-specific path resolution)
- `consent-manager.ts` (no consent model)
- `ui-server.ts`, `ui-session.ts`, `ui-resource-handler.ts`, `ui-stream-types.ts` (UI)
- `mcp-panel.ts`, `mcp-setup-panel.ts`, `host-html-template.ts` (TUI panels)
- `glimpse-ui.ts` (macOS native UI)
- `sampling-handler.ts` (replace with env-based stub if stretch goal)
- `elicitation-handler.ts` (no interactive UI)
- `commands.ts`, `onboarding-state.ts`, `panel-keys.ts` (Pi slash commands)
- `oauth-handler.ts` (Pi OAuth UI handler)
- `app-bridge.bundle.js` (browser UI bridge)
- `tool-result-renderer.ts` (Pi-specific rendering)
- `resource-tools.ts` (merged into tool-metadata.ts)
- `error-signal.ts` (Pi tool error override)
- `errors.ts` (reduce to minimal set)
- `metadata-cache.ts` UI-related parts
- `tool-metadata.ts` UI resource URI extraction

### Files to create new

- `src/server.ts` — MCP server setup (replaces `index.ts`)
- `src/cli.ts` — CLI entry point
- `src/handlers/list-tools.ts` — MCP ListTools handler
- `src/handlers/call-tool.ts` — MCP CallTool handler
- `src/config/paths.ts` — Standalone path resolution
- `bin/mcp-tool-search.js` — Binary entry

---

## Error Handling

- **Config errors**: Log to stderr, start with empty config (no servers). Don't crash.
- **Connect errors**: Track in failureTracker, 60s backoff. Return error message in tool result.
- **Tool call errors**: Return MCP error result `{ content: [{ type: "text", text: error.message }], isError: true }`.
- **Auth errors**: Return "needs-auth" status with instructions for `auth-start`.
- **Output guard**: Never throw — always return content (possibly truncated with file path).
- **Process signals**: SIGINT/SIGTERM → graceful shutdown (close connections, flush cache, clear intervals, close callback server).

---

## Testing Strategy

- **Unit tests** (vitest): config loading, metadata cache, output guard, tool metadata, npx resolver, env interpolation, proxy actions (search/describe with mock state)
- **Integration tests**: server manager with mock MCP servers (stdio + HTTP), lifecycle manager, lazy connect flow
- **E2E test**: Start the gateway as a subprocess, send MCP `initialize` + `tools/list` + `tools/call` over stdio, verify responses