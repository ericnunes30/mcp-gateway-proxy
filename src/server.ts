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
  const t0 = Date.now();
  const configPath = overridePath ?? getConfigFromArgv();
  const t1 = Date.now();
  logger.info(`[TIMING] getConfigFromArgv: ${t1 - t0}ms`);

  const config = loadMcpConfig(configPath);
  const t2 = Date.now();
  logger.info(`[TIMING] loadMcpConfig: ${t2 - t1}ms`);

  logger.info("MCP: starting mcp-tool-search server...");

  state = await createGatewayState({ config });
  const t3 = Date.now();
  logger.info(`[TIMING] createGatewayState: ${t3 - t2}ms`);

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
  const t4 = Date.now();
  logger.info(`[TIMING] new Server: ${t4 - t3}ms`);

  registerListToolsHandler(server, state, config);
  registerCallToolHandler(server, () => state, config);
  const t5 = Date.now();
  logger.info(`[TIMING] register handlers: ${t5 - t4}ms`);

  // Log client info on initialize
  server.oninitialized = () => {
    const tInit = Date.now();
    logger.info(`[TIMING] oninitialized called at ${tInit - t0}ms from start`);
    logger.info("MCP: client connected");
  };

  const transport = new StdioServerTransport();
  const t6 = Date.now();
  logger.info(`[TIMING] new StdioServerTransport: ${t6 - t5}ms`);

  await server.connect(transport);
  const t7 = Date.now();
  logger.info(`[TIMING] server.connect(transport): ${t7 - t6}ms`);

  logger.info(`[TIMING] TOTAL startup: ${t7 - t0}ms`);
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
