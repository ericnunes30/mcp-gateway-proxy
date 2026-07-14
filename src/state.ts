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

  // Defer all heavy work so createGatewayState resolves immediately
  // (MCP clients like Codex timeout if initialize is blocked)
  process.nextTick(() => {
    bootstrapState(state, config, signal).catch((err) => {
      logger.error(`MCP: Background init failed: ${err}`);
    });
  });

  return state;
}

/** Background bootstrap — never blocks the caller. */
async function bootstrapState(state: GatewayState, config: McpConfig, signal?: AbortSignal): Promise<void> {
  const serverEntries = Object.entries(config.mcpServers);
  if (serverEntries.length === 0) return;

  // Set global idle timeout
  const idleSetting = typeof config.settings?.idleTimeout === "number" ? config.settings.idleTimeout : 10;
  state.lifecycle.setGlobalIdleTimeout(idleSetting);

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
    state.lifecycle.registerServer(
      name,
      definition,
      idleOverride !== undefined ? { idleTimeout: idleOverride } : undefined,
    );
    if (lifecycleMode === "keep-alive") {
      state.lifecycle.markKeepAlive(name, definition);
    }

    const currentCache = loadMetadataCache();
    if (currentCache?.servers?.[name] && isServerCacheValid(currentCache.servers[name], definition)) {
      const metadata = reconstructToolMetadata(name, currentCache.servers[name], prefix, definition);
      state.toolMetadata.set(name, metadata);
    }
  }

  // Connect eager + keep-alive servers in background
  const startupServers = serverEntries.filter(([, definition]) => {
    const mode = definition.lifecycle ?? "lazy";
    return mode === "keep-alive" || mode === "eager";
  });

  if (startupServers.length > 0) {
    logger.info(`MCP: connecting to ${startupServers.length} servers...`);

    parallelLimit(startupServers, 10, async ([name, definition]) => {
      try {
        const connection = await state.manager.connect(name, definition, signal);
        if (connection.status === "needs-auth") {
          logger.warn(`MCP: ${name} requires OAuth authentication`);
          return;
        }
        if (connection.status === "connected") {
          updateServerMetadata(state, name);
          updateMetadataCache(state, name);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`MCP: Failed to connect to ${name}: ${message}`);
      }
    }).catch(() => {
      // Ignore background connection errors
    });
  }

  // Set up lifecycle callbacks
  state.lifecycle.setReconnectCallback((serverName) => {
    updateServerMetadata(state, serverName);
    updateMetadataCache(state, serverName);
    state.failureTracker.delete(serverName);
  });

  state.lifecycle.setIdleShutdownCallback((serverName) => {
    logger.debug(`${serverName} shut down (idle)`);
  });

  state.lifecycle.startHealthChecks();
}

export async function shutdownGatewayState(state: GatewayState): Promise<void> {
  await state.lifecycle.gracefulShutdown();
}
