// config.ts - Config loading with multi-file precedence and merge
import { existsSync, readFileSync } from "node:fs";
import type { McpConfig, ServerEntry, McpSettings, ImportKind } from "./types.ts";
import { getConfigSources } from "./paths.ts";
import { expandImports } from "./imports.ts";

export function loadMcpConfig(overridePath?: string, cwd = process.cwd()): McpConfig {
  let config: McpConfig = { mcpServers: {} };

  for (const source of getConfigSources(overridePath, cwd)) {
    const loaded = readValidatedConfig(source.readPath, `MCP config from ${source.readPath}`);
    if (!loaded) continue;
    config = mergeConfigs(config, expandImports(loaded, cwd));
  }

  return config;
}

export function mergeConfigs(base: McpConfig, next: McpConfig): McpConfig {
  return {
    mcpServers: mergeServerMaps(base.mcpServers, next.mcpServers),
    imports: mergeImports(base.imports, next.imports),
    settings: next.settings ? { ...base.settings, ...next.settings } : base.settings,
  };
}

export function mergeServerMaps(
  base: Record<string, ServerEntry>,
  next: Record<string, ServerEntry>,
): Record<string, ServerEntry> {
  const merged = { ...base };
  for (const [name, definition] of Object.entries(next)) {
    merged[name] = { ...(merged[name] ?? {}), ...definition };
  }
  return merged;
}

export function mergeImports(left: ImportKind[] | undefined, right: ImportKind[] | undefined): ImportKind[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])];
  if (merged.length === 0) return undefined;
  return [...new Set(merged)];
}

export function readValidatedConfig(path: string, label: string): McpConfig | null {
  if (!existsSync(path)) return null;

  try {
    return validateConfig(JSON.parse(readFileSync(path, "utf-8")));
  } catch (error) {
    console.warn(`Failed to load ${label}:`, error);
    return null;
  }
}

export function validateConfig(raw: unknown): McpConfig {
  if (!raw || typeof raw !== "object") {
    return { mcpServers: {} };
  }

  const obj = raw as Record<string, unknown>;
  const servers = obj.mcpServers ?? obj["mcp-servers"] ?? {};

  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    return { mcpServers: {} };
  }

  return {
    mcpServers: servers as Record<string, ServerEntry>,
    imports: Array.isArray(obj.imports) ? (obj.imports as ImportKind[]) : undefined,
    settings: obj.settings as McpSettings | undefined,
  };
}
