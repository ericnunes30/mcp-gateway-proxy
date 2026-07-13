# Spec: MCP Gateway Proxy

## Overview

A standalone MCP (Model Context Protocol) server that acts as a unified gateway/proxy to multiple downstream MCP servers. Any MCP-compatible client (Cursor, Claude Code, Codex, VSCode, Windsurf, Claude Desktop) connects to this tool as a standard MCP server via stdio. The gateway exposes a single `mcp` proxy tool (~200 tokens) that lets the agent search, describe, and call tools from all configured downstream servers on-demand — dramatically reducing context window consumption compared to registering every tool individually.

Based on the architecture of `pi-mcp-adapter` v2.11.0, ported to a standalone MCP server with no dependency on the Pi coding agent platform.

## Problem Statement

A single MCP server can burn 10,000+ tokens of context with verbose tool definitions. Connecting multiple servers can consume half the context window before the conversation even starts. This gateway solves that by exposing one proxy tool instead of hundreds, with on-demand tool discovery.

## Goals

1. **Universal compatibility** — works with any MCP client that supports stdio MCP servers
2. **Minimal context footprint** — one proxy tool (~200 tokens) instead of hundreds
3. **On-demand discovery** — agent searches/describes/calls tools as needed
4. **Lazy connections** — downstream servers connect only when their tools are used
5. **Full feature parity** with pi-mcp-adapter (minus Pi-specific UI features)

## Non-Goals

- No TUI/panel/setup wizard UI (Pi-specific)
- No MCP UI integration (interactive web UIs in browser/Glimpse — Pi-specific)
- No in-process LLM-based sampling (no built-in model access; opt-in via env only)
- No interactive elicitation forms (no UI for user prompts)
- No cross-session server sharing (each gateway process runs its own server connections)

## Stakeholders

- **Primary**: Developers using MCP-compatible AI coding agents (Cursor, Claude Code, Codex, VSCode) who want to use multiple MCP servers without context bloat
- **Secondary**: MCP server developers who want their servers accessible through a lightweight gateway

---

## P1: Core Proxy Server (MVP) ⭐

### User Story

As a developer using Cursor/Claude Code/Codex, I want to connect a single MCP server that gives me access to all my MCP tools through one proxy tool, so that I save context tokens and only load tools on demand.

### Acceptance Criteria

#### AC-1: MCP Server via stdio

1. WHEN the gateway is started with no arguments THEN it SHALL start an MCP server on stdio transport
2. WHEN an MCP client sends `initialize` THEN the gateway SHALL respond with server info `{ name: "mcp-tool-search", version: "..." }` and capabilities `{ tools: {} }`
3. WHEN an MCP client sends `tools/list` THEN the gateway SHALL return at minimum the `mcp` proxy tool
4. WHEN an MCP client sends `tools/call` with name `mcp` THEN the gateway SHALL dispatch to the appropriate proxy action based on parameters
5. WHEN the gateway receives SIGINT or SIGTERM THEN it SHALL gracefully shut down (close connections, flush cache, clear intervals)
6. WHEN the gateway writes any log output THEN it SHALL write to stderr only (never stdout, which carries MCP JSON-RPC)

#### AC-2: Proxy Tool Actions

7. WHEN the agent calls `mcp({})` THEN the gateway SHALL return server status (connected/cached/not-connected servers with tool counts)
8. WHEN the agent calls `mcp({ server: "name" })` THEN the gateway SHALL list tools for that server (from cache or live connection)
9. WHEN the agent calls `mcp({ search: "keyword" })` THEN the gateway SHALL return all tools whose name or description match (space-separated terms OR'd, case-insensitive)
10. WHEN the agent calls `mcp({ search: "pattern", regex: true })` THEN the gateway SHALL treat the query as a regex pattern (with ReDoS safety check)
11. WHEN the agent calls `mcp({ describe: "tool_name" })` THEN the gateway SHALL return the tool's full description and formatted parameter schema
12. WHEN the agent calls `mcp({ tool: "tool_name", args: '{"key":"value"}' })` THEN the gateway SHALL call the downstream MCP tool and return the result
13. WHEN the agent calls `mcp({ tool: "tool_name", args: 'invalid json' })` THEN the gateway SHALL return an error indicating invalid JSON
14. WHEN the agent calls `mcp({ tool: "tool_name" })` and the tool exists on multiple servers THEN the gateway SHALL return an error suggesting to specify `server` parameter
15. WHEN the agent calls `mcp({ connect: "server-name" })` THEN the gateway SHALL connect to that server and return its tool list

#### AC-3: Config Loading

16. WHEN the gateway starts THEN it SHALL load config from JSON files in precedence order (lowest to highest):
    - `~/.config/mcp/mcp.json` (shared global)
    - `~/.config/mcp-tool-search/mcp.json` (tool-specific global override)
    - `.mcp.json` (project-local shared)
    - `.mcp-tool-search.json` (project-local override)
17. WHEN the config contains `imports: ["cursor", "claude-code"]` THEN the gateway SHALL load servers from those host-specific config files and merge them
18. WHEN the same server name appears in multiple config files THEN the higher-precedence config SHALL override (shallow merge per server)
19. WHEN no config file exists THEN the gateway SHALL start with zero servers and return "No servers configured" on status
20. WHEN config has `settings` field THEN the gateway SHALL apply those settings (toolPrefix, idleTimeout, requestTimeoutMs, etc.)

#### AC-4: Downstream Server Connections (stdio + HTTP)

21. WHEN a server entry has `command` and `args` THEN the gateway SHALL connect via stdio transport (spawning the command as a subprocess)
22. WHEN a server entry has `url` THEN the gateway SHALL connect via StreamableHTTP transport first, falling back to SSE on non-auth errors
23. WHEN a server entry has `command: "npx"` THEN the gateway SHALL resolve the npx package to a direct binary path (skipping the ~143 MB npm parent process)
24. WHEN a server entry has `env` with `${VAR}` or `$env:VAR` patterns THEN the gateway SHALL interpolate environment variables
25. WHEN a server entry has `cwd` THEN the gateway SHALL resolve it with `~` and env var expansion
26. WHEN a server connection fails THEN the gateway SHALL track the failure and apply a 60-second backoff before retrying

#### AC-5: Lazy Connect + Metadata Cache

27. WHEN the gateway starts THEN it SHALL NOT connect to lazy servers (default lifecycle); it SHALL load tool metadata from disk cache instead
28. WHEN the agent calls a tool from a lazy server THEN the gateway SHALL connect on-demand (lazy connect)
29. WHEN a server connects successfully THEN the gateway SHALL fetch tools and resources, build metadata, and update the disk cache
30. WHEN the cache does not exist for a server THEN search/list/describe SHALL indicate "not connected" and suggest `mcp({ connect: "server" })`
31. WHEN the cache exists for a server THEN search/list/describe SHALL work without a live connection
32. WHEN the gateway shuts down THEN it SHALL flush the metadata cache to disk

#### AC-6: Output Guard

33. WHEN a downstream tool returns text output exceeding 50 KiB or 2,000 lines THEN the gateway SHALL truncate to a head preview and save full output to a temp file (mode 0600), including the file path in the result
34. WHEN a downstream tool returns image content THEN the gateway SHALL pass it through unchanged (not subject to text truncation)
35. WHEN the env var `MCP_OUTPUT_GUARD=0` is set THEN the gateway SHALL disable the output guard and return raw output
36. WHEN settings contain `outputGuard: { maxBytes, maxLines, detailsMaxBytes }` THEN the gateway SHALL use those custom limits

---

## P2: Authentication & Lifecycle ⭐

### User Story

As a developer using MCP servers that require OAuth (like Figma, Linear) or bearer tokens, I want the gateway to handle authentication so I can use those servers seamlessly. I also want fine-grained control over server lifecycle (lazy/eager/keep-alive).

### Acceptance Criteria

#### AC-7: Bearer Token Auth

37. WHEN a server entry has `auth: "bearer"` and `bearerToken` THEN the gateway SHALL add `Authorization: Bearer <token>` to HTTP headers
38. WHEN a server entry has `bearerTokenEnv` THEN the gateway SHALL read the token from that environment variable
39. WHEN `bearerToken` contains `${VAR}` patterns THEN the gateway SHALL interpolate environment variables

#### AC-8: OAuth 2.1 Authentication

40. WHEN an HTTP server returns `UnauthorizedError` on connect AND the server supports OAuth THEN the gateway SHALL return a "needs-auth" status
41. WHEN the agent calls `mcp({ action: "auth-start", server: "name" })` THEN the gateway SHALL start the OAuth flow and return the authorization URL with manual completion instructions
42. WHEN the agent calls `mcp({ action: "auth-complete", server: "name", args: '{"redirectUrl":"..."}' })` THEN the gateway SHALL complete the OAuth flow using the redirect URL
43. WHEN the agent calls `mcp({ action: "auth-complete", server: "name", args: '{"code":"..."}' })` THEN the gateway SHALL complete using just the authorization code
44. WHEN OAuth tokens are obtained THEN the gateway SHALL persist them to disk (mode 0600) keyed by server URL hash
45. WHEN stored OAuth tokens are expired THEN the gateway SHALL indicate "needs-auth" on next connect
46. WHEN the server URL changes THEN the gateway SHALL invalidate stored credentials for the old URL
47. WHEN a server uses `oauth.grantType: "client_credentials"` THEN the gateway SHALL complete the flow headlessly (no browser needed)
48. WHEN `settings.autoAuth: true` THEN the gateway SHALL automatically start OAuth on connect/tool calls when a server needs auth, then retry once

#### AC-9: Lifecycle Modes

49. WHEN a server has `lifecycle: "lazy"` (default) THEN the gateway SHALL NOT connect at startup, connect on first tool call, and disconnect after idle timeout (default 10 minutes)
50. WHEN a server has `lifecycle: "eager"` THEN the gateway SHALL connect at startup but NOT auto-reconnect if connection drops
51. WHEN a server has `lifecycle: "keep-alive"` THEN the gateway SHALL connect at startup, auto-reconnect via health checks (every 30 seconds), and never auto-disconnect
52. WHEN a lazy server has been idle for `idleTimeout` minutes THEN the gateway SHALL disconnect it
53. WHEN an in-flight request is running on a server THEN the gateway SHALL NOT disconnect it due to idle timeout
54. WHEN per-server `idleTimeout` is set THEN it SHALL override the global `settings.idleTimeout`

---

## P3: Direct Tools & Advanced Features ⭐

### User Story

As a developer, I want to promote specific high-value tools as first-class MCP tools (visible directly in the agent's tool list) so the LLM can use them without search roundtrips. I also want config imports from existing host setups.

### Acceptance Criteria

#### AC-10: Direct Tools

55. WHEN a server has `directTools: true` THEN the gateway SHALL register all its tools as individual MCP tools (alongside the proxy tool)
56. WHEN a server has `directTools: ["tool_a", "tool_b"]` THEN the gateway SHALL register only those specific tools as direct MCP tools
57. WHEN `settings.directTools: true` is set globally THEN the gateway SHALL apply it to all servers, unless a server overrides with `directTools: false`
58. WHEN a direct tool is called THEN the gateway SHALL execute it directly (same lazy-connect logic as proxy calls)
59. WHEN a direct tool name collides with the `mcp` proxy tool name THEN the gateway SHALL skip the colliding direct tool
60. WHEN a direct tool name collides across servers THEN the gateway SHALL register only the first occurrence
61. WHEN `settings.disableProxyTool: true` AND all servers have direct tools available from cache THEN the gateway SHALL NOT register the `mcp` proxy tool
62. WHEN a server has `excludeTools: ["tool_name"]` THEN the gateway SHALL exclude those tools from direct registration, proxy search/list/describe

#### AC-11: Tool Prefix

63. WHEN `settings.toolPrefix` is `"server"` (default) THEN tool names SHALL be prefixed with the server name (e.g., `chrome_devtools_take_screenshot`)
64. WHEN `settings.toolPrefix` is `"short"` THEN tool names SHALL use a shortened prefix (strips `-mcp` suffix, hyphens to underscores)
65. WHEN `settings.toolPrefix` is `"none"` THEN tool names SHALL NOT be prefixed

#### AC-12: Host Config Imports

66. WHEN config has `imports: ["cursor"]` THEN the gateway SHALL load `~/.cursor/mcp.json` and merge its `mcpServers` (or `mcp-servers`)
67. WHEN config has `imports: ["claude-code"]` THEN the gateway SHALL load from `~/.claude/mcp.json`, `~/.claude.json`, or `~/.claude/claude_desktop_config.json`
68. WHEN config has `imports: ["codex"]` THEN the gateway SHALL load `~/.codex/config.json`
69. WHEN config has `imports: ["vscode"]` THEN the gateway SHALL load `.vscode/mcp.json` (project-relative)
70. WHEN config has `imports: ["windsurf"]` THEN the gateway SHALL load `~/.windsurf/mcp.json`
71. WHEN config has `imports: ["claude-desktop"]` THEN the gateway SHALL load the macOS Claude Desktop config path
72. WHEN the same server name exists in both imported config and user config THEN the user-defined server SHALL take precedence

#### AC-13: Resource Exposure

73. WHEN a server has `exposeResources` not set to `false` THEN the gateway SHALL expose MCP resources as synthetic `get_<resource_name>` tools
74. WHEN a resource tool is called THEN the gateway SHALL call `readResource` on the downstream server and return the content

#### AC-14: CLI

75. WHEN the user runs `mcp-tool-search init` THEN the CLI SHALL scan for host-specific configs, print what was found, and write missing imports to the tool-specific global config
76. WHEN the user runs `mcp-tool-search init --dry-run` THEN the CLI SHALL print what it would do without writing any files
77. WHEN the user runs `mcp-tool-search` with no subcommand THEN it SHALL start the MCP stdio server (default behavior)

#### AC-15: Request Timeout

78. WHEN a server has `requestTimeoutMs` set to a positive number THEN the gateway SHALL apply that timeout to all live MCP calls to that server
79. WHEN `settings.requestTimeoutMs` is set THEN the gateway SHALL use it as the global default for servers without a per-server override
80. WHEN `requestTimeoutMs` is omitted or <= 0 THEN the gateway SHALL use the MCP SDK default timeout

---

## P4: Future / Not in Scope

- MCP UI integration (interactive web UIs, Glimpse native rendering, bidirectional messaging)
- MCP sampling with built-in LLM (opt-in env-based sampling is a stretch goal, see AC-16)
- MCP elicitation (form/URL prompts requiring interactive UI)
- Cross-session server sharing
- Setup wizard / interactive panel
- RepoPrompt integration

### Stretch Goals (optional, may be included)

#### AC-16: Opt-in Sampling via Env

81. WHEN env vars `MCP_SAMPLING_API_KEY` and `MCP_SAMPLING_MODEL` are set THEN the gateway SHALL advertise `sampling: {}` capability and handle sampling requests using the configured LLM
82. WHEN sampling is not configured via env THEN the gateway SHALL return `McpError(InternalError, "Sampling not configured")` for any sampling request from a downstream server