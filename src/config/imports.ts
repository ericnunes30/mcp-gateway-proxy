// imports.ts - Host-specific config discovery and loading
import { existsSync, readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import type { McpConfig, ServerEntry, ImportKind } from "./types.ts";
import { IMPORT_PATHS, findAvailableImportConfigs } from "./paths.ts";
import { mergeServerMaps } from "./config.ts";

export { findAvailableImportConfigs };

export function expandImports(config: McpConfig, cwd = process.cwd()): McpConfig {
  if (!config.imports?.length) return config;

  const importedServers: Record<string, ServerEntry> = {};
  for (const importKind of config.imports) {
    const importPath = resolveImportPathForKind(importKind, cwd);
    if (!importPath) continue;

    try {
      const imported = JSON.parse(readFileSync(importPath, "utf-8"));
      const servers = extractServers(imported, importKind);
      for (const [name, definition] of Object.entries(servers)) {
        if (!importedServers[name]) {
          importedServers[name] = definition;
        }
      }
    } catch (error) {
      console.warn(`Failed to import MCP config from ${importKind}:`, error);
    }
  }

  return {
    imports: config.imports,
    settings: config.settings,
    mcpServers: mergeServerMaps(importedServers, config.mcpServers),
  };
}

function resolveImportPathForKind(importKind: ImportKind, cwd = process.cwd()): string | null {
  const candidates = IMPORT_PATHS[importKind] ?? [];
  for (const candidate of candidates) {
    const fullPath = isAbsolute(candidate) ? candidate : resolve(cwd, candidate);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export function loadHostConfig(kind: ImportKind, cwd = process.cwd()): Record<string, ServerEntry> {
  const importPath = resolveImportPathForKind(kind, cwd);
  if (!importPath) return {};

  try {
    const imported = JSON.parse(readFileSync(importPath, "utf-8"));
    return extractServers(imported, kind);
  } catch (error) {
    console.warn(`Failed to load host config from ${kind}:`, error);
    return {};
  }
}

export function extractServers(config: unknown, kind: ImportKind): Record<string, ServerEntry> {
  if (!config || typeof config !== "object") return {};

  const obj = config as Record<string, unknown>;

  let servers: unknown;
  switch (kind) {
    case "claude-desktop":
    case "claude-code":
    case "codex":
      servers = obj.mcpServers;
      break;
    case "cursor":
    case "windsurf":
    case "vscode":
      servers = obj.mcpServers ?? obj["mcp-servers"];
      break;
    default:
      return {};
  }

  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return {};
  }

  return servers as Record<string, ServerEntry>;
}
