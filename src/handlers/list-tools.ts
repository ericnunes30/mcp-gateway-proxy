// list-tools.ts - ListToolsRequest handler
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { GatewayState } from "../lifecycle/lazy-connect.ts";
import type { McpConfig } from "../config/types.ts";
import type { MetadataCache } from "../cache/metadata-cache.ts";
import { loadMetadataCache } from "../cache/metadata-cache.ts";
import { resolveDirectTools, getMissingConfiguredDirectToolServers, buildProxyDescription } from "../tools/direct-tools.ts";
import { getProxyToolDescription, getProxyToolInputSchema } from "../tools/proxy.ts";
import { logger } from "../utils/logger.ts";

export function registerListToolsHandler(
  server: Server,
  state: GatewayState,
  config: McpConfig,
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const prefix = config.settings?.toolPrefix ?? "server";
    const cache = loadMetadataCache();
    const envRaw = process.env.MCP_DIRECT_TOOLS;
    const directSpecs = envRaw === "__none__"
      ? []
      : resolveDirectTools(
          config,
          cache,
          prefix,
          envRaw?.split(",").map(s => s.trim()).filter(Boolean),
        );

    const missingConfigured = getMissingConfiguredDirectToolServers(config, cache);
    const shouldRegisterProxyTool =
      config.settings?.disableProxyTool !== true
      || directSpecs.length === 0
      || missingConfigured.length > 0;

    const tools: Array<{ name: string; description: string; inputSchema: unknown }> = [];

    // Add direct tools
    for (const spec of directSpecs) {
      tools.push({
        name: spec.prefixedName,
        description: spec.description || `(MCP tool from ${spec.serverName})`,
        inputSchema: spec.inputSchema ?? { type: "object", properties: {} },
      });
    }

    // Add proxy tool
    if (shouldRegisterProxyTool) {
      tools.push({
        name: "mcp",
        description: getProxyToolDescription(config, cache, directSpecs),
        inputSchema: getProxyToolInputSchema(),
      });
    }

    return { tools };
  });
}
