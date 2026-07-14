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

let state: GatewayState | null = null;

export async function startServer(overridePath?: string): Promise<void> {
  const configPath = overridePath ?? getConfigFromArgv();
  const config = loadMcpConfig(configPath);

  logger.info("MCP: starting mcp-tool-search server...");

  state = await createGatewayState({ config });

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

  registerListToolsHandler(server, state, config);
  registerCallToolHandler(server, () => state, config);

  server.oninitialized = () => {
    logger.info("MCP: client connected");
  };

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP: server ready on stdio");

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info("MCP: shutting down...");
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
