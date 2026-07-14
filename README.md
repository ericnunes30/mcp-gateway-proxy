# mcp-tool-search

A standalone MCP (Model Context Protocol) gateway/proxy server that lets any MCP-compatible client (Cursor, Claude Code, Codex, VSCode, Windsurf, Claude Desktop, Pi) search and call tools across multiple downstream MCP servers through a single `mcp` proxy tool.

## Features

- Single `mcp` proxy tool (~200 tokens) for on-demand tool search/describe/call
- Connects to multiple downstream MCP servers (stdio, HTTP, SSE, StreamableHTTP)
- Direct tool mode: expose individual MCP tools as native tools
- Metadata caching with content-based invalidation
- OAuth authentication support (authorization_code + client_credentials)
- npx resolution (skip ~143MB npm parent process)
- Output guarding (50KiB / 2000 line truncation)
- Config compatible with standard MCP `mcpServers` format
- stdio transport only (all clients supported)
- Builds with [tsup](https://github.com/egoist/tsup) (esbuild) — keeps `.ts` import extensions in source, compiles to single-file `.js` bundle

## Quick Start

### Installation

```bash
npm install -g mcp-tool-search
```

Or build from source:

```bash
git clone https://github.com/ericnunes30/mcp-gateway-proxy.git
cd mcp-gateway-proxy
npm install
npm run build
```

### Configuration

Create a config file at `~/.config/mcp-tool-search/config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "github": {
      "url": "https://api.github.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN"    }
  }
}
```

### CLI Usage

```bash
# Using --mcp-config (preferred)
node dist/cli.js --mcp-config ~/.config/mcp-tool-search/config.json

# --config also works as an alias
node dist/cli.js --config ~/.config/mcp-tool-search/config.json
```

### Client Configuration

#### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mcp-tool-search": {
      "command": "mcp-tool-search",
      "args": ["--mcp-config", "/path/to/config.json"]
    }
  }
}
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-tool-search": {
      "command": "npx",
      "args": ["mcp-tool-search", "--mcp-config", "/path/to/config.json"]
    }
  }
}
```

#### Claude Code

Claude Code reads MCP server config from `~/.claude.json` (home directory), not `.claude/settings.json`. On Windows, use the absolute path to `node.exe`.

```json
{
  "mcpServers": {
    "mcp-tool-search": {
      "type": "stdio",
      "command": "C:/PROGRA~1/nodejs/node.exe",
      "args": [
        "G:/novosApps/mcp-tool-search/dist/cli.js",
        "--mcp-config",
        "C:/Users/Eric/.config/mcp-tool-search/config.json"
      ]
    }
  }
}
```

#### Pi (with [pi-mcp-extension](https://github.com/irahardianto/pi-mcp-extension))

Add to `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "mcp-tool-search": {
      "command": "node",
      "args": ["/path/to/mcp-gateway-proxy/dist/cli.js", "--mcp-config", "/path/to/config.json"],
      "lifecycle": "eager"
    }
  }
}
```

The proxy connects to all your downstream MCP servers. The Pi extension only needs to know about the proxy — no duplication of tools.

```
Pi agent → pi-mcp-extension → mcp-tool-search (proxy) → N downstream servers
```

## Proxy Tool Usage

The `mcp` tool accepts these parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `tool` | string | Tool name to call |
| `args` | string | Arguments as JSON string |
| `connect` | string | Server name to connect |
| `describe` | string | Tool name to describe |
| `search` | string | Search query |
| `regex` | boolean | Treat search as regex |
| `includeSchemas` | boolean | Include schemas in search |
| `server` | string | Filter to server |
| `action` | string | "ui-messages", "auth-start", "auth-complete" |

### Examples

```
mcp({})                                              → Show server status
mcp({ server: "filesystem" })                        → List tools from server
mcp({ search: "file" })                              → Search tools
mcp({ describe: "read_file" })                        → Show tool details
mcp({ connect: "github" })                            → Connect to server
mcp({ tool: "read_file", args: '{"path":"/foo"}' })   → Call a tool
mcp({ action: "auth-start", server: "linear" })      → Start OAuth
mcp({ action: "auth-complete", server: "linear", args: '{"redirectUrl":"..."}' }) → Complete OAuth
```

### Example Output

```
mcp({}) →
MCP: 2/5 servers, 38 tools

✓ chrome-devtools (29 tools)
✓ pencil (9 tools)
○ stitch (not connected)
○ tavily (not connected)
○ computer-use (not connected)
```

```
mcp({ search: "screenshot" }) →
Found 3 tools matching "screenshot":

chrome_devtools_take_screenshot
  Take a screenshot of the page or element.
  Parameters: format, quality, uid, fullPage, filePath

pencil_get_screenshot
  Returns a screenshot of a node in a .pen file.
  Parameters: filePath, nodeId
```

## Configuration Reference

### Server Entry

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Command to run (stdio) |
| `args` | string[] | Arguments for command |
| `env` | Record<string,string> | Environment variables |
| `url` | string | HTTP/SSE/StreamableHTTP URL |
| `headers` | Record<string,string> | HTTP headers |
| `transport` | "stdio" \| "http" \| "sse" \| "streamable-http" | Transport type |
| `type` | "http" | Alias for transport (standard MCP compatibility) |
| `oauth` | object | OAuth configuration |
| `lifecycle` | "lazy" \| "eager" \| "keep-alive" | Connection mode |
| `idleTimeout` | number | Idle timeout (seconds) |
| `directTools` | boolean \| string[] | Expose as direct tools |
| `excludeTools` | string[] | Tools to exclude |
| `exposeResources` | boolean | Expose resources as tools |
| `toolPrefix` | "server" \| "short" \| "none" | Tool name prefix |
| `requestTimeoutMs` | number | Request timeout |
| `autoAuth` | boolean | Auto-start OAuth |
| `bearerToken` | string | Bearer token |
| `bearerTokenEnv` | string | Env var name for bearer token |

### Settings (top-level)

| Field | Type | Description |
|-------|------|-------------|
| `toolPrefix` | "server" \| "short" \| "none" | Global tool prefix |
| `directTools` | boolean \| string[] | Global direct tools |
| `autoAuth` | boolean | Global auto-auth |
| `idleTimeout` | number | Global idle timeout |
| `requestTimeoutMs` | number | Global request timeout |
| `disableProxyTool` | boolean | Disable proxy tool |
| `authRequiredMessage` | string | Custom auth message |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MCP_TOOL_SEARCH_DEBUG` | Enable debug logging to stderr |
| `MCP_TOOL_SEARCH_DATA_DIR` | Data directory override (default: `~/.config/mcp-tool-search/`) |
| `MCP_DIRECT_TOOLS` | Direct tools filter (comma-separated, `server/tool` or `server`) |
| `MCP_TOOL_SEARCH_NPX_CACHE_TTL` | npx cache TTL in ms (default: 24h) |

## Architecture

```
┌──────────────────┐     stdio      ┌──────────────────┐
│  MCP Client      │◄──────────────►│  mcp-tool-search │
│  (Cursor, etc.)  │   JSON-RPC     │   (this server)  │
└──────────────────┘                └────────┬─────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
              ┌─────┴─────┐            ┌──────┴──────┐           ┌──────┴──────┐
              │  stdio    │            │   HTTP/SSE  │           │ Streamable  │
              │  server   │            │   server    │           │   HTTP      │
              └───────────┘            └─────────────┘           └─────────────┘
```

## Development

```bash
npm install      # Install dependencies
npm run build    # Build with tsup → dist/cli.js
npm run typecheck # Type-check with tsc (no emit)
npm test         # Run vitest test suite (84 tests)
```

### Build System

The project uses [tsup](https://github.com/egoist/tsup) (powered by esbuild) for compilation:

- **Source code** uses `.ts` import extensions (e.g., `import { foo } from "./types.ts"`)
- **tsconfig.json** has `noEmit: true` for type-checking only
- **tsup** bundles everything into a single `dist/cli.js` file (~150KB)
- Dependencies (`@modelcontextprotocol/sdk`, `open`, `recheck`, `typebox`, `zod`) are externalized

### Project Structure

```
src/
├── cli.ts                    # CLI entry point
├── server.ts                 # MCP server setup + stdio transport
├── state.ts                  # Gateway state factory
├── config/
│   ├── types.ts              # Config types (McpConfig, ServerEntry, etc.)
│   ├── config.ts             # Config loader + merge logic
│   ├── imports.ts            # Config imports/expand logic
│   └── paths.ts              # Config path resolution
├── cache/
│   ├── metadata-cache.ts     # Metadata cache (hash-based invalidation)
│   └── tool-metadata.ts      # Tool metadata builder + search
├── auth/
│   ├── auth-store.ts         # Token storage (secure file permissions)
│   ├── oauth-provider.ts     # OAuth client provider
│   ├── oauth-flow.ts         # OAuth flow (start, complete, authenticate)
│   └── callback-server.ts    # OAuth callback HTTP server
├── mcp/
│   ├── server-manager.ts     # MCP server connection manager
│   ├── transport.ts          # Transport creation (stdio/HTTP/SSE/StreamableHTTP)
│   └── npx-resolver.ts       # npx package resolution (skip npm parent)
├── lifecycle/
│   ├── lifecycle.ts          # Lifecycle manager (lazy/eager/keep-alive)
│   └── lazy-connect.ts       # Lazy connect with 60s failure backoff
├── guard/
│   └── output-guard.ts       # Output truncation (50KiB / 2000 lines)
├── tools/
│   ├── proxy.ts              # Proxy tool definition + dispatch
│   ├── proxy-actions.ts      # Proxy action handlers (search/describe/call/etc.)
│   ├── direct-tools.ts       # Direct tool resolution + executor
│   └── tool-registrar.ts     # MCP content transformation
├── handlers/
│   ├── list-tools.ts         # ListToolsRequest handler
│   └── call-tool.ts          # CallToolRequest handler
└── utils/
    ├── abort.ts              # AbortSignal utilities
    ├── logger.ts             # stderr-only logger
    ├── env.ts                # Environment variable interpolation
    └── utils.ts              # General utilities (parallelLimit, etc.)
```

## License

MIT