// proxy.ts - The `mcp` proxy tool definition and dispatch logic
import type { ContentBlock, McpConfig } from "../config/types.ts";
import type { MetadataCache } from "../cache/metadata-cache.ts";
import type { DirectToolSpec } from "../config/types.ts";
import type { GatewayState } from "../lifecycle/lazy-connect.ts";
import {
  executeStatus,
  executeSearch,
  executeDescribe,
  executeList,
  executeConnect,
  executeCall,
  executeAuthStart,
  executeAuthComplete,
  executeUiMessages,
} from "./proxy-actions.ts";
import { buildProxyDescription } from "./direct-tools.ts";

export interface ProxyToolParams {
  tool?: string;
  args?: string;
  connect?: string;
  describe?: string;
  search?: string;
  regex?: boolean;
  includeSchemas?: boolean;
  server?: string;
  action?: string;
}

export type ProxyToolResult = {
  content: ContentBlock[];
  details?: Record<string, unknown>;
  isError?: boolean;
};

export function getProxyToolDescription(
  config: McpConfig,
  cache: MetadataCache | null,
  directSpecs: DirectToolSpec[],
): string {
  return buildProxyDescription(config, cache, directSpecs);
}

export function getProxyToolInputSchema() {
  return {
    type: "object" as const,
    properties: {
      tool: { type: "string", description: "Tool name to call (e.g., 'xcodebuild_list_sims')" },
      args: { type: "string", description: "Arguments as JSON string (e.g., '{\"key\": \"value\"}')" },
      connect: { type: "string", description: "Server name to connect (lazy connect + metadata refresh)" },
      describe: { type: "string", description: "Tool name to describe (shows parameters)" },
      search: { type: "string", description: "Search tools by name/description" },
      regex: { type: "boolean", description: "Treat search as regex (default: substring match)" },
      includeSchemas: { type: "boolean", description: "Include parameter schemas in search results (default: true)" },
      server: { type: "string", description: "Filter to specific server (also disambiguates tool calls)" },
      action: { type: "string", description: "Action: 'ui-messages', 'auth-start', or 'auth-complete'" },
    },
  };
}

export async function executeProxy(
  state: GatewayState,
  params: ProxyToolParams,
  signal?: AbortSignal,
): Promise<ProxyToolResult> {
  // Parse args JSON if provided
  let parsedArgs: Record<string, unknown> | undefined;
  if (params.args) {
    try {
      parsedArgs = JSON.parse(params.args);
      if (typeof parsedArgs !== "object" || parsedArgs === null || Array.isArray(parsedArgs)) {
        const gotType = Array.isArray(parsedArgs) ? "array" : parsedArgs === null ? "null" : typeof parsedArgs;
        throw new Error(`Invalid args: expected a JSON object, got ${gotType}`);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid args JSON: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  // Support clients that pass all params inside args (e.g., Pi with pi-mcp-extension)
  const action = params.action ?? (parsedArgs?.action as string | undefined);
  const tool = params.tool ?? (parsedArgs?.tool as string | undefined);
  const connect = params.connect ?? (parsedArgs?.connect as string | undefined);
  const describe = params.describe ?? (parsedArgs?.describe as string | undefined);
  const search = params.search ?? (parsedArgs?.search as string | undefined);
  const server = params.server ?? (parsedArgs?.server as string | undefined);
  const regex = params.regex ?? (parsedArgs?.regex as boolean | undefined);
  const includeSchemas = params.includeSchemas ?? (parsedArgs?.includeSchemas as boolean | undefined);

  // For tool args: if tool came from parsedArgs, extract nested args field
  let toolArgs: Record<string, unknown> | undefined = parsedArgs;
  if (!params.tool && parsedArgs && typeof parsedArgs === "object") {
    const nestedArgs = parsedArgs.args;
    if (typeof nestedArgs === "string") {
      try {
        toolArgs = JSON.parse(nestedArgs);
      } catch {
        toolArgs = undefined;
      }
    } else if (typeof nestedArgs === "object" && nestedArgs !== null) {
      toolArgs = nestedArgs as Record<string, unknown>;
    }
  }

  // Dispatch based on params — priority: action > tool (call) > connect > describe > search > server (list) > nothing (status)
  if (action === "ui-messages") {
    return executeUiMessages(state);
  }
  if (action === "auth-start") {
    if (!server) {
      return {
        content: [{ type: "text", text: "auth-start requires `server`. Example: mcp({ action: \"auth-start\", server: \"linear-server\" })" }],
        details: { mode: "auth-start", error: "missing_server" },
      };
    }
    return executeAuthStart(state, server);
  }
  if (action === "auth-complete") {
    if (!server) {
      return {
        content: [{ type: "text", text: "auth-complete requires `server`." }],
        details: { mode: "auth-complete", error: "missing_server" },
      };
    }
    const input = parsedArgs?.redirectUrl ?? parsedArgs?.code ?? parsedArgs?.input;
    if (typeof input !== "string" || input.trim().length === 0) {
      return {
        content: [{ type: "text", text: "auth-complete requires args with `redirectUrl`, `code`, or `input`." }],
        details: { mode: "auth-complete", error: "missing_input" },
      };
    }
    return executeAuthComplete(state, server, input);
  }
  if (tool) {
    return executeCall(state, tool, toolArgs, server, signal);
  }
  if (connect) {
    return executeConnect(state, connect, signal);
  }
  if (describe) {
    return executeDescribe(state, describe);
  }
  if (search) {
    return executeSearch(state, search, regex, server, includeSchemas);
  }
  if (server) {
    return executeList(state, server);
  }
  return executeStatus(state);
}
