# mcp-tool-search

A standalone MCP (Model Context Protocol) gateway/proxy server that lets any MCP-compatible client (Cursor, Claude Code, Codex, VSCode, Windsurf, Claude Desktop) search and call tools across multiple downstream MCP servers through a single `mcp` proxy tool.

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

## Quick Start

### Installation

```bash
npm install -g mcp-tool-search
```

### Configuration

Create a config file (e.g., `~/.config/mcp-tool-search/config.json`):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "github": {
      "url": "https://api.github.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
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

### Environment

| Variable | Description |
|----------|-------------|
| `MCP_TOOL_SEARCH_DEBUG` | Enable debug logging |
| `MCP_TOOL_SEARCH_DATA_DIR` | Data directory override |
| `MCP_DIRECT_TOOLS` | Direct tools filter |

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
npm install
npm run build
npm test
```

## License

MIT
