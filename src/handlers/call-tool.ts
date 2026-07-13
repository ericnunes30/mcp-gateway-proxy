// call-tool.ts - CallToolRequest handler
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { GatewayState } from "../lifecycle/lazy-connect.ts";
import type { McpConfig } from "../config/types.ts";
import type { MetadataCache } from "../cache/metadata-cache.ts";
import { loadMetadataCache } from "../cache/metadata-cache.ts";
import { resolveDirectTools } from "../tools/direct-tools.ts";
import { createDirectToolExecutor } from "../tools/direct-tools.ts";
import { executeProxy, type ProxyToolParams } from "../tools/proxy.ts";
import { logger } from "../utils/logger.ts";

export function registerCallToolHandler(
  server: Server,
  getState: () => GatewayState | null,
  config: McpConfig,
): void {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const state = getState();

    if (!state) {
      return {
        content: [{ type: "text" as const, text: "MCP not initialized" }],
        isError: true,
      };
    }

    // If it's the proxy tool, dispatch via executeProxy
    if (name === "mcp") {
      try {
        const result = await executeProxy(state, (args ?? {}) as ProxyToolParams, request.params._meta?.["abortSignal"] as AbortSignal | undefined);
        return {
          content: result.content,
          isError: result.isError,
          _meta: result.details,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    }

    // Otherwise, it's a direct tool — find and execute it
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

    const spec = directSpecs.find(s => s.prefixedName === name);
    if (!spec) {
      return {
        content: [{ type: "text" as const, text: `Tool "${name}" not found. Use mcp({ search: "..." }) to search.` }],
        isError: true,
      };
    }

    const executor = createDirectToolExecutor(getState, async () => state, spec);
    try {
      const result = await executor(args ?? {}, undefined);
      return {
        content: result.content,
        isError: result.isError,
        _meta: result.details,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  });
}
