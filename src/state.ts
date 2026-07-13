// state.ts - Gateway state factory
import { existsSync } from "node:fs";
import type { McpConfig, ToolMetadata } from "./config/types.ts";
import { McpServerManager } from "./mcp/server-manager.ts";
import { McpLifecycleManager } from "./lifecycle/lifecycle.ts";
import {
  loadMetadataCache,
  saveMetadataCache,
  isServerCacheValid,
  reconstructToolMetadata,
} from "./cache/metadata-cache.ts";
import { parallelLimit } from "./utils/utils.ts";
import { logger } from "./utils/logger.ts";
import { buildToolMetadata } from "./cache/tool-metadata.ts";
import type { GatewayState } from "./lifecycle/lazy-connect.ts";
import { updateMetadataCache, updateServerMetadata } from "./lifecycle/lazy-connect.ts";

export type { GatewayState } from "./lifecycle/lazy-connect.ts";

export interface CreateStateOptions {
  config: McpConfig;
  cwd?: string;
  signal?: AbortSignal;
}

export async function createGatewayState(options: CreateStateOptions): Promise<GatewayState> {
  const { config, cwd, signal } = options;
  const workingDir = cwd ?? process.cwd();

  const manager = new McpServerManager(workingDir);
  manager.setDefaultRequestTimeoutMs(config.settings?.requestTimeoutMs);

  const lifecycle = new McpLifecycleManager(manager);
  const toolMetadata = new Map<string, ToolMetadata[]>();
  const failureTracker = new Map<string, number>();

  const state: GatewayState = {
    manager,
    lifecycle,
    toolMetadata,
    config,
    failureTracker,
  };

  const serverEntries = Object.entries(config.mcpServers);
  if (serverEntries.length === 0) {
    return state;
  }

  // Set global idle timeout
  const idleSetting = typeof config.settings?.idleTimeout === "number" ? config.settings.idleTimeout : 10;
  lifecycle.setGlobalIdleTimeout(idleSetting);

  // Load or bootstrap cache
  const cache = loadMetadataCache();
  if (!cache) {
    saveMetadataCache({ version: 1, servers: {} });
  }

  const prefix = config.settings?.toolPrefix ?? "server";

  // Register all servers with lifecycle and reconstruct metadata from cache
  for (const [name, definition] of serverEntries) {
    const lifecycleMode = definition.lifecycle ?? "lazy";
    const idleOverride = definition.idleTimeout ?? (lifecycleMode === "eager" ? 0 : undefined);
    lifecycle.registerServer(
      name,
      definition,
      idleOverride !== undefined ? { idleTimeout: idleOverride } : undefined,
    );
    if (lifecycleMode === "keep-alive") {
      lifecycle.markKeepAlive(name, definition);
    }

    const currentCache = loadMetadataCache();
    if (currentCache?.servers?.[name] && isServerCacheValid(currentCache.servers[name], definition)) {
      const metadata = reconstructToolMetadata(name, currentCache.servers[name], prefix, definition);
      toolMetadata.set(name, metadata);
    }
  }

  // Connect eager + keep-alive servers in parallel
  const startupServers = serverEntries.filter(([, definition]) => {
    const mode = definition.lifecycle ?? "lazy";
    return mode === "keep-alive" || mode === "eager";
  });

  if (startupServers.length > 0) {
    logger.info(`MCP: connecting to ${startupServers.length} servers...`);

    const results = await parallelLimit(startupServers, 10, async ([name, definition]) => {
      try {
        const connection = await manager.connect(name, definition, signal);
        if (connection.status === "needs-auth") {
          return { name, ok: false, error: "OAuth authentication required" };
        }
        return { name, ok: true, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { name, ok: false, error: message };
      }
    });

    for (const { name, ok, error } of results) {
      if (!ok) {
        logger.error(`MCP: Failed to connect to ${name}: ${error}`);
        continue;
      }
      const connection = manager.getConnection(name);
      if (connection && connection.status === "connected") {
        updateServerMetadata(state, name);
        updateMetadataCache(state, name);
      }
    }
  }

  // Set up lifecycle callbacks
  lifecycle.setReconnectCallback((serverName) => {
    updateServerMetadata(state, serverName);
    updateMetadataCache(state, serverName);
    failureTracker.delete(serverName);
  });

  lifecycle.setIdleShutdownCallback((serverName) => {
    logger.debug(`${serverName} shut down (idle)`);
  });

  lifecycle.startHealthChecks();

  return state;
}

export async function shutdownGatewayState(state: GatewayState): Promise<void> {
  await state.lifecycle.gracefulShutdown();
}
