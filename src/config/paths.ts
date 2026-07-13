// paths.ts - Path resolution for config files, data directory, and host configs
import { homedir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import type { ImportKind } from "./types.ts";

// Data directory override via env var
export function getDataDir(): string {
  const envOverride = process.env.MCP_TOOL_SEARCH_DATA_DIR;
  if (envOverride) return resolve(envOverride);
  return join(homedir(), ".config", "mcp-tool-search");
}

// Config file paths in precedence order (lowest → highest)
const SHARED_GLOBAL_CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");
const TOOL_GLOBAL_CONFIG_PATH = join(getDataDir(), "mcp.json");

export function getSharedGlobalConfigPath(): string {
  return SHARED_GLOBAL_CONFIG_PATH;
}

export function getToolGlobalConfigPath(overridePath?: string): string {
  if (overridePath) return resolve(overridePath);
  return TOOL_GLOBAL_CONFIG_PATH;
}

export function getProjectConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, ".mcp.json");
}

export function getProjectToolConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, ".mcp-tool-search.json");
}

// Config source spec for loadMcpConfig
export interface ConfigSourceSpec {
  id: "shared-global" | "tool-global" | "shared-project" | "tool-project";
  label: string;
  readPath: string;
  writePath: string;
  kind: "user" | "project" | "import";
  importKind?: string;
  shared: boolean;
  scope: "global" | "project";
}

export interface ConfigDiscoveryPath {
  label: string;
  path: string;
  exists: boolean;
}

export interface DiscoveredImportConfig {
  kind: ImportKind;
  path: string;
}

// Host-specific config file paths
export const IMPORT_PATHS: Record<ImportKind, string[]> = {
  cursor: [join(homedir(), ".cursor", "mcp.json")],
  "claude-code": [
    join(homedir(), ".claude", "mcp.json"),
    join(homedir(), ".claude.json"),
    join(homedir(), ".claude", "claude_desktop_config.json"),
  ],
  "claude-desktop": [join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json")],
  codex: [join(homedir(), ".codex", "config.json")],
  windsurf: [join(homedir(), ".windsurf", "mcp.json")],
  vscode: [".vscode/mcp.json"],
};

// Resolve an import kind to the first existing config file path
export function resolveImportPath(kind: ImportKind, cwd = process.cwd()): string | undefined {
  const paths = IMPORT_PATHS[kind];
  for (const p of paths) {
    const resolved = isAbsolute(p) ? p : resolve(cwd, p);
    if (existsSync(resolved)) return resolved;
  }
  // Return the first path even if it doesn't exist (for discovery reporting)
  const first = paths[0];
  return first ? (isAbsolute(first) ? first : resolve(cwd, first)) : undefined;
}

// Get the config file path for a specific import kind
export function getHostConfigPath(kind: ImportKind, cwd = process.cwd()): string | undefined {
  return resolveImportPath(kind, cwd);
}

// Get all config sources in precedence order
export function getConfigSources(overridePath?: string, cwd = process.cwd()): ConfigSourceSpec[] {
  const toolGlobalPath = getToolGlobalConfigPath(overridePath);
  const projectPath = getProjectConfigPath(cwd);
  const projectToolPath = getProjectToolConfigPath(cwd);
  const sources: ConfigSourceSpec[] = [];

  // 1. Shared global (standard MCP)
  if (SHARED_GLOBAL_CONFIG_PATH !== toolGlobalPath) {
    sources.push({
      id: "shared-global",
      label: "user-global standard MCP",
      readPath: SHARED_GLOBAL_CONFIG_PATH,
      writePath: toolGlobalPath,
      kind: "import",
      importKind: "global MCP config",
      shared: true,
      scope: "global",
    });
  }

  // 2. Tool-specific global override
  sources.push({
    id: "tool-global",
    label: "mcp-tool-search global override",
    readPath: toolGlobalPath,
    writePath: toolGlobalPath,
    kind: "user",
    shared: false,
    scope: "global",
  });

  // 3. Project standard MCP
  if (projectPath !== toolGlobalPath) {
    sources.push({
      id: "shared-project",
      label: "project standard MCP",
      readPath: projectPath,
      writePath: projectPath,
      kind: "project",
      shared: true,
      scope: "project",
    });
  }

  // 4. Project tool-specific override
  if (projectToolPath !== toolGlobalPath && projectToolPath !== projectPath) {
    sources.push({
      id: "tool-project",
      label: "project mcp-tool-search override",
      readPath: projectToolPath,
      writePath: projectToolPath,
      kind: "project",
      shared: false,
      scope: "project",
    });
  }

  return sources;
}

// Get discovery paths for diagnostics/UI
export function getConfigDiscoveryPaths(overridePath?: string, cwd = process.cwd()): ConfigDiscoveryPath[] {
  return getConfigSources(overridePath, cwd).map((source) => ({
    label: source.label,
    path: source.readPath,
    exists: existsSync(source.readPath),
  }));
}

// Find all host-specific configs that exist on disk
export function findAvailableImportConfigs(cwd = process.cwd()): DiscoveredImportConfig[] {
  const discovered: DiscoveredImportConfig[] = [];

  for (const importKind of Object.keys(IMPORT_PATHS) as ImportKind[]) {
    const importPath = resolveImportPath(importKind, cwd);
    if (importPath && existsSync(importPath)) {
      discovered.push({ kind: importKind, path: importPath });
    }
  }

  return discovered;
}

// Data file paths (cache, oauth, npx cache)
export function getCachePath(): string {
  return join(getDataDir(), "cache.json");
}

export function getNpxCachePath(): string {
  return join(getDataDir(), "npx-cache.json");
}

export function getOAuthDir(): string {
  return join(getDataDir(), "oauth");
}
