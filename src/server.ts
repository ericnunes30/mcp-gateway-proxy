// server.ts - MCP server setup with stdio transport
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadMcpConfig } from "./config/config.ts";
import { createGatewayState, shutdownGatewayState, type GatewayState } from "./state.ts";
import { registerListToolsHandler } from "./handlers/list-tools.ts";
import { registerCallToolHandler } from "./handlers/call-tool.ts";
import { flushMetadataCache } from "./lifecycle/lazy-connect.ts";
import { logger } from "./utils/logger.ts";
import { getConfigFromArgv } from "./utils/utils.ts";
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let state: GatewayState | null = null;

// Debug log file — persistent across process restarts
const debugLogFile = join(homedir(), ".config", "mcp-tool-search", "server-debug.log");

function debugLog(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
  console.error(line);
  try {
    appendFileSync(debugLogFile, line + "\n");
  } catch {
    // ignore write errors
  }
}

export async function startServer(overridePath?: string): Promise<void> {
  debugLog("PROCESS STARTED — pid=", process.pid, "node=", process.version);

  const t0 = Date.now();
  const configPath = overridePath ?? getConfigFromArgv();
  debugLog("[TIMING] getConfigFromArgv:", Date.now() - t0, "ms");

  const config = loadMcpConfig(configPath);
  debugLog("[TIMING] loadMcpConfig:", Date.now() - t0, "ms");

  debugLog("MCP: starting mcp-tool-search server...");

  state = await createGatewayState({ config });
  debugLog("[TIMING] createGatewayState:", Date.now() - t0, "ms");

  const server = new Server(
    {
      name: "mcp-tool-search",
      version: "0.0.1",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );
  debugLog("[TIMING] new Server:", Date.now() - t0, "ms");

  registerListToolsHandler(server, state, config);
  registerCallToolHandler(server, () => state, config);
  debugLog("[TIMING] register handlers:", Date.now() - t0, "ms");

  // Log when initialize is completed (called by SDK after handling initialize)
  server.oninitialized = () => {
    debugLog("[TIMING] oninitialized called at", Date.now() - t0, "ms from start");
    debugLog("MCP: client connected — server state ready");
  };

  const transport = new StdioServerTransport();
  debugLog("[TIMING] new StdioServerTransport:", Date.now() - t0, "ms");

  await server.connect(transport);
  debugLog("[TIMING] server.connect(transport):", Date.now() - t0, "ms");
  debugLog("[TIMING] TOTAL startup:", Date.now() - t0, "ms");
  debugLog("MCP: server ready on stdio");

  // Heartbeat to confirm process stays alive
  setInterval(() => {
    debugLog("HEARTBEAT — alive for", Date.now() - t0, "ms");
  }, 3000);

  // Handle graceful shutdown
  const shutdown = async () => {
    debugLog("MCP: shutting down...");
    if (state) {
      flushMetadataCache(state);
      await shutdownGatewayState(state);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export function getServerState(): GatewayState | null {
  return state;
}
