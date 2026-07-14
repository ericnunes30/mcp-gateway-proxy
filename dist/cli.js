#!/usr/bin/env node

// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/config/config.ts
import { existsSync as existsSync3, readFileSync as readFileSync2 } from "fs";

// src/config/paths.ts
import { homedir as homedir2 } from "os";
import { join as join2, resolve, isAbsolute } from "path";
import { existsSync } from "fs";

// src/utils/env.ts
import { homedir } from "os";
import { join } from "path";
function interpolateEnvVars(value) {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "").replace(/\$env:(\w+)/g, (_, name) => process.env[name] ?? "");
}
function interpolateEnvRecord(values) {
  if (!values) return void 0;
  const resolved = {};
  for (const [key, value] of Object.entries(values)) {
    resolved[key] = interpolateEnvVars(value);
  }
  return resolved;
}
function resolveConfigPath(value) {
  if (value === void 0) return void 0;
  const resolved = interpolateEnvVars(value);
  if (resolved === "~") return homedir();
  if (resolved.startsWith("~/") || resolved.startsWith("~\\")) {
    return join(homedir(), resolved.slice(2));
  }
  return resolved;
}

// src/config/paths.ts
function getDataDir() {
  const envOverride = process.env.MCP_TOOL_SEARCH_DATA_DIR;
  if (envOverride) return resolve(resolveConfigPath(envOverride) ?? envOverride);
  return join2(homedir2(), ".config", "mcp-tool-search");
}
var SHARED_GLOBAL_CONFIG_PATH = join2(homedir2(), ".config", "mcp", "mcp.json");
var TOOL_GLOBAL_CONFIG_PATH = join2(getDataDir(), "mcp.json");
function getToolGlobalConfigPath(overridePath) {
  if (overridePath) return resolve(resolveConfigPath(overridePath) ?? overridePath);
  return TOOL_GLOBAL_CONFIG_PATH;
}
function getProjectConfigPath(cwd = process.cwd()) {
  return resolve(cwd, ".mcp.json");
}
function getProjectToolConfigPath(cwd = process.cwd()) {
  return resolve(cwd, ".mcp-tool-search.json");
}
var IMPORT_PATHS = {
  cursor: [join2(homedir2(), ".cursor", "mcp.json")],
  "claude-code": [
    join2(homedir2(), ".claude", "mcp.json"),
    join2(homedir2(), ".claude.json"),
    join2(homedir2(), ".claude", "claude_desktop_config.json")
  ],
  "claude-desktop": [join2(homedir2(), "Library", "Application Support", "Claude", "claude_desktop_config.json")],
  codex: [join2(homedir2(), ".codex", "config.json")],
  windsurf: [join2(homedir2(), ".windsurf", "mcp.json")],
  vscode: [".vscode/mcp.json"]
};
function getConfigSources(overridePath, cwd = process.cwd()) {
  const toolGlobalPath = getToolGlobalConfigPath(overridePath);
  const projectPath = getProjectConfigPath(cwd);
  const projectToolPath = getProjectToolConfigPath(cwd);
  const sources = [];
  if (SHARED_GLOBAL_CONFIG_PATH !== toolGlobalPath) {
    sources.push({
      id: "shared-global",
      label: "user-global standard MCP",
      readPath: SHARED_GLOBAL_CONFIG_PATH,
      writePath: toolGlobalPath,
      kind: "import",
      importKind: "global MCP config",
      shared: true,
      scope: "global"
    });
  }
  sources.push({
    id: "tool-global",
    label: "mcp-tool-search global override",
    readPath: toolGlobalPath,
    writePath: toolGlobalPath,
    kind: "user",
    shared: false,
    scope: "global"
  });
  if (projectPath !== toolGlobalPath) {
    sources.push({
      id: "shared-project",
      label: "project standard MCP",
      readPath: projectPath,
      writePath: projectPath,
      kind: "project",
      shared: true,
      scope: "project"
    });
  }
  if (projectToolPath !== toolGlobalPath && projectToolPath !== projectPath) {
    sources.push({
      id: "tool-project",
      label: "project mcp-tool-search override",
      readPath: projectToolPath,
      writePath: projectToolPath,
      kind: "project",
      shared: false,
      scope: "project"
    });
  }
  return sources;
}
function getCachePath() {
  return join2(getDataDir(), "cache.json");
}
function getNpxCachePath() {
  return join2(getDataDir(), "npx-cache.json");
}
function getOAuthDir() {
  return join2(getDataDir(), "oauth");
}

// src/config/imports.ts
import { existsSync as existsSync2, readFileSync } from "fs";
import { resolve as resolve2, isAbsolute as isAbsolute2 } from "path";
function expandImports(config, cwd = process.cwd()) {
  if (!config.imports?.length) return config;
  const importedServers = {};
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
    mcpServers: mergeServerMaps(importedServers, config.mcpServers)
  };
}
function resolveImportPathForKind(importKind, cwd = process.cwd()) {
  const candidates = IMPORT_PATHS[importKind] ?? [];
  for (const candidate of candidates) {
    const fullPath = isAbsolute2(candidate) ? candidate : resolve2(cwd, candidate);
    if (existsSync2(fullPath)) {
      return fullPath;
    }
  }
  return null;
}
function extractServers(config, kind) {
  if (!config || typeof config !== "object") return {};
  const obj = config;
  let servers;
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
  return servers;
}

// src/config/config.ts
function loadMcpConfig(overridePath, cwd = process.cwd()) {
  let config = { mcpServers: {} };
  for (const source of getConfigSources(overridePath, cwd)) {
    const loaded = readValidatedConfig(source.readPath, `MCP config from ${source.readPath}`);
    if (!loaded) continue;
    config = mergeConfigs(config, expandImports(loaded, cwd));
  }
  return config;
}
function mergeConfigs(base, next) {
  return {
    mcpServers: mergeServerMaps(base.mcpServers, next.mcpServers),
    imports: mergeImports(base.imports, next.imports),
    settings: next.settings ? { ...base.settings, ...next.settings } : base.settings
  };
}
function mergeServerMaps(base, next) {
  const merged = { ...base };
  for (const [name, definition] of Object.entries(next)) {
    merged[name] = { ...merged[name] ?? {}, ...definition };
  }
  return merged;
}
function mergeImports(left, right) {
  const merged = [...left ?? [], ...right ?? []];
  if (merged.length === 0) return void 0;
  return [...new Set(merged)];
}
function readValidatedConfig(path, label) {
  if (!existsSync3(path)) return null;
  try {
    return validateConfig(JSON.parse(readFileSync2(path, "utf-8")));
  } catch (error) {
    console.warn(`Failed to load ${label}:`, error);
    return null;
  }
}
function validateConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return { mcpServers: {} };
  }
  const obj = raw;
  const servers = obj.mcpServers ?? obj["mcp-servers"] ?? {};
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    return { mcpServers: {} };
  }
  return {
    mcpServers: servers,
    imports: Array.isArray(obj.imports) ? obj.imports : void 0,
    settings: obj.settings
  };
}

// src/mcp/server-manager.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport as StreamableHTTPClientTransport2 } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError as UnauthorizedError3 } from "@modelcontextprotocol/sdk/client/auth.js";

// src/mcp/npx-resolver.ts
import { existsSync as existsSync4, readFileSync as readFileSync3, realpathSync, readdirSync, statSync, writeFileSync, renameSync, mkdirSync, openSync, readSync, closeSync } from "fs";
import { join as join3, dirname, extname, resolve as resolve3, sep } from "path";
import { spawn, spawnSync } from "child_process";
var CACHE_VERSION = 1;
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
async function resolveNpxBinary(command, args) {
  const parsed = command === "npx" ? parseNpxArgs(args) : command === "npm" ? parseNpmExecArgs(args) : null;
  if (!parsed) return null;
  const cacheKey = JSON.stringify([command, ...args]);
  const cache = loadCache();
  const cached = cache?.entries?.[cacheKey];
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS && existsSync4(cached.resolvedBin)) {
    return { binPath: cached.resolvedBin, extraArgs: parsed.extraArgs, isJs: cached.isJs };
  }
  const resolved = resolveFromNpmCache(parsed.packageSpec, parsed.binName);
  if (resolved) {
    saveCacheEntry(cacheKey, resolved);
    return { binPath: resolved.resolvedBin, extraArgs: parsed.extraArgs, isJs: resolved.isJs };
  }
  await forceNpxCache(parsed.packageSpec);
  const resolvedAfterInstall = resolveFromNpmCache(parsed.packageSpec, parsed.binName);
  if (resolvedAfterInstall) {
    saveCacheEntry(cacheKey, resolvedAfterInstall);
    return { binPath: resolvedAfterInstall.resolvedBin, extraArgs: parsed.extraArgs, isJs: resolvedAfterInstall.isJs };
  }
  return null;
}
function parseNpxArgs(args) {
  const separatorIndex = args.indexOf("--");
  const before = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const after = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];
  const positionals = [];
  let packageSpec;
  let sawPackageFlag = false;
  let foundFirstPositional = false;
  for (let i = 0; i < before.length; i++) {
    const arg = before[i];
    if (foundFirstPositional) {
      positionals.push(arg);
      continue;
    }
    if (arg === "-y" || arg === "--yes") continue;
    if (arg === "-p" || arg === "--package") {
      const value = before[i + 1];
      if (!value || value.startsWith("-")) return null;
      if (!packageSpec) packageSpec = value;
      sawPackageFlag = true;
      i++;
      continue;
    }
    if (arg.startsWith("--package=")) {
      const value = arg.slice("--package=".length);
      if (!value) return null;
      if (!packageSpec) packageSpec = value;
      sawPackageFlag = true;
      continue;
    }
    if (arg.startsWith("-")) {
      return null;
    }
    positionals.push(arg);
    foundFirstPositional = true;
  }
  const separatedAfter = separatorIndex >= 0 && after.length > 0 ? ["--", ...after] : after;
  if (sawPackageFlag) {
    const binName = positionals[0];
    if (!packageSpec || !binName) return null;
    const extraArgs2 = positionals.slice(1).concat(separatedAfter);
    return { packageSpec, binName, extraArgs: extraArgs2 };
  }
  const packagePositional = positionals[0];
  if (!packagePositional) return null;
  const extraArgs = positionals.slice(1).concat(separatedAfter);
  return { packageSpec: packagePositional, extraArgs };
}
function parseNpmExecArgs(args) {
  if (args[0] !== "exec") return null;
  const execArgs = args.slice(1);
  const separatorIndex = execArgs.indexOf("--");
  if (separatorIndex < 0) return null;
  const before = execArgs.slice(0, separatorIndex);
  const after = execArgs.slice(separatorIndex + 1);
  let packageSpec;
  for (let i = 0; i < before.length; i++) {
    const arg = before[i];
    if (arg === "-y" || arg === "--yes") continue;
    if (arg === "--package") {
      const value = before[i + 1];
      if (!value || value.startsWith("-")) return null;
      if (!packageSpec) packageSpec = value;
      i++;
      continue;
    }
    if (arg.startsWith("--package=")) {
      const value = arg.slice("--package=".length);
      if (!value) return null;
      if (!packageSpec) packageSpec = value;
      continue;
    }
    if (arg.startsWith("-")) {
      return null;
    }
  }
  const binName = after[0];
  if (!packageSpec || !binName) return null;
  const extraArgs = after.slice(1);
  return { packageSpec, binName, extraArgs };
}
function resolveFromNpmCache(packageSpec, binName) {
  const cacheDir = getNpmCacheDir();
  if (!cacheDir) return null;
  const packageName = extractPackageName(packageSpec);
  if (!packageName) return null;
  const packageDir = findCachedPackageDir(cacheDir, packageName);
  if (!packageDir) return null;
  const packageJsonPath = join3(packageDir, "package.json");
  if (!existsSync4(packageJsonPath)) return null;
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync3(packageJsonPath, "utf-8"));
  } catch {
    return null;
  }
  const binField = pkg?.bin;
  if (!binField) return null;
  const candidates = buildBinCandidates(packageName, binName);
  let chosenBinName;
  let binRel;
  if (typeof binField === "string") {
    chosenBinName = defaultBinName(packageName);
    binRel = binField;
  } else {
    for (const candidate of candidates) {
      if (binField[candidate]) {
        chosenBinName = candidate;
        binRel = binField[candidate];
        break;
      }
    }
    if (!binRel) {
      const firstEntry = Object.entries(binField)[0];
      if (firstEntry) {
        chosenBinName = firstEntry[0];
        binRel = firstEntry[1];
      }
    }
  }
  if (!binRel) return null;
  const nodeModulesDir = findNodeModulesDir(packageDir);
  const binLink = chosenBinName ? join3(nodeModulesDir, ".bin", chosenBinName) : null;
  let resolvedBin = binLink && existsSync4(binLink) ? safeRealpath(binLink) : "";
  if (!resolvedBin) {
    resolvedBin = resolve3(packageDir, binRel);
    if (!existsSync4(resolvedBin)) return null;
  }
  const isJs = detectJsBinary(resolvedBin);
  return {
    resolvedBin,
    resolvedAt: Date.now(),
    packageVersion: pkg?.version,
    isJs
  };
}
var FORCE_CACHE_TIMEOUT_MS = 3e4;
async function forceNpxCache(packageSpec) {
  try {
    await new Promise((resolve4, reject) => {
      const proc = spawn(
        "npm",
        ["exec", "--yes", "--package", packageSpec, "--", "node", "-e", "1"],
        { stdio: "ignore" }
      );
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("timeout"));
      }, FORCE_CACHE_TIMEOUT_MS);
      timer.unref();
      proc.on("close", () => {
        clearTimeout(timer);
        resolve4();
      });
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } catch {
  }
}
function buildBinCandidates(packageName, explicitBin) {
  const candidates = [];
  if (explicitBin) candidates.push(explicitBin);
  if (packageName.startsWith("@")) {
    const namePart = packageName.split("/")[1] ?? "";
    const scopePart = packageName.split("/")[0]?.replace("@", "") ?? "";
    if (namePart) candidates.push(namePart);
    if (scopePart && namePart) candidates.push(`${scopePart}-${namePart}`);
  } else {
    candidates.push(packageName);
  }
  return [...new Set(candidates.filter(Boolean))];
}
function extractPackageName(spec) {
  const trimmed = spec.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) {
    const slashIndex = trimmed.indexOf("/");
    if (slashIndex < 0) return null;
    const atIndex2 = trimmed.lastIndexOf("@");
    if (atIndex2 > slashIndex) {
      return trimmed.slice(0, atIndex2);
    }
    return trimmed;
  }
  const atIndex = trimmed.indexOf("@");
  return atIndex >= 0 ? trimmed.slice(0, atIndex) : trimmed;
}
function defaultBinName(packageName) {
  if (packageName.startsWith("@")) {
    const parts = packageName.split("/");
    return parts[1] ?? packageName.replace("@", "").replace("/", "-");
  }
  return packageName;
}
function findCachedPackageDir(cacheDir, packageName) {
  const npxDir = join3(cacheDir, "_npx");
  if (!existsSync4(npxDir)) return null;
  const packagePathParts = packageName.startsWith("@") ? packageName.split("/") : [packageName];
  const candidates = readdirSync(npxDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const full = join3(npxDir, entry.name);
    const mtime = safeStatMtime(full);
    return { name: entry.name, mtime };
  }).sort((a, b) => b.mtime - a.mtime);
  for (const entry of candidates) {
    const pkgDir = join3(npxDir, entry.name, "node_modules", ...packagePathParts);
    if (existsSync4(join3(pkgDir, "package.json"))) {
      return pkgDir;
    }
  }
  return null;
}
function findNodeModulesDir(packageDir) {
  const parts = packageDir.split(sep);
  const idx = parts.lastIndexOf("node_modules");
  if (idx >= 0) {
    return parts.slice(0, idx + 1).join(sep);
  }
  return join3(packageDir, "..");
}
function detectJsBinary(binPath) {
  const ext = extname(binPath).toLowerCase();
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return true;
  try {
    const fd = openSync(binPath, "r");
    try {
      const buf = Buffer.alloc(256);
      readSync(fd, buf, 0, 256, 0);
      const firstLine = buf.toString("utf-8").split("\n")[0] ?? "";
      return firstLine.startsWith("#!") && firstLine.includes("node");
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}
var npmCacheDirCached;
function getNpmCacheDir() {
  if (npmCacheDirCached !== void 0) return npmCacheDirCached;
  if (process.env.NPM_CONFIG_CACHE) {
    npmCacheDirCached = process.env.NPM_CONFIG_CACHE;
    return npmCacheDirCached;
  }
  try {
    const result = spawnSync("npm", ["config", "get", "cache"], { encoding: "utf-8" });
    if (result.status === 0) {
      const path = String(result.stdout).trim();
      npmCacheDirCached = path || null;
      return npmCacheDirCached;
    }
  } catch {
    npmCacheDirCached = null;
    return null;
  }
  npmCacheDirCached = null;
  return null;
}
function loadCache() {
  const cachePath = getNpxCachePath();
  if (!existsSync4(cachePath)) return null;
  try {
    const raw = JSON.parse(readFileSync3(cachePath, "utf-8"));
    if (!raw || typeof raw !== "object") return null;
    if (raw.version !== CACHE_VERSION) return null;
    if (!raw.entries || typeof raw.entries !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}
function saveCacheEntry(key, entry) {
  const cachePath = getNpxCachePath();
  const dir = dirname(cachePath);
  mkdirSync(dir, { recursive: true });
  let merged = { version: CACHE_VERSION, entries: {} };
  try {
    if (existsSync4(cachePath)) {
      const existing = JSON.parse(readFileSync3(cachePath, "utf-8"));
      if (existing && existing.version === CACHE_VERSION && existing.entries) {
        merged.entries = { ...existing.entries };
      }
    }
  } catch {
  }
  merged.entries[key] = entry;
  const tmpPath = `${cachePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
  renameSync(tmpPath, cachePath);
}
function safeRealpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return "";
  }
}
function safeStatMtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

// src/utils/logger.ts
var LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var LEVEL_PREFIX = {
  debug: "[MCP-TOOL-SEARCH:DEBUG]",
  info: "[MCP-TOOL-SEARCH]",
  warn: "[MCP-TOOL-SEARCH:WARN]",
  error: "[MCP-TOOL-SEARCH:ERROR]"
};
var Logger = class {
  minLevel = "info";
  handlers = [];
  defaultContext = {};
  setLevel(level) {
    this.minLevel = level;
  }
  setDefaultContext(context) {
    this.defaultContext = context;
  }
  addHandler(handler) {
    this.handlers.push(handler);
  }
  clearHandlers() {
    this.handlers = [];
  }
  shouldLog(level) {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }
  emit(level, message, context, error) {
    if (!this.shouldLog(level)) return;
    const entry = {
      level,
      message,
      context: { ...this.defaultContext, ...context },
      error,
      timestamp: /* @__PURE__ */ new Date()
    };
    const prefix = LEVEL_PREFIX[level];
    const contextStr = formatContext(entry.context);
    const fullMessage = contextStr ? `${prefix} ${message} ${contextStr}` : `${prefix} ${message}`;
    if (level === "error") {
      console.error(fullMessage, error ?? "");
    } else if (level === "warn") {
      console.warn(fullMessage);
    } else if (level === "debug") {
      console.error(fullMessage);
    } else {
      console.error(fullMessage);
    }
    for (const handler of this.handlers) {
      try {
        handler(entry);
      } catch {
      }
    }
  }
  debug(message, context) {
    this.emit("debug", message, context);
  }
  info(message, context) {
    this.emit("info", message, context);
  }
  warn(message, context) {
    this.emit("warn", message, context);
  }
  error(message, error, context) {
    this.emit("error", message, context, error);
  }
  /**
   * Create a child logger with additional default context.
   */
  child(context) {
    return new ChildLogger(this, context);
  }
};
var ChildLogger = class _ChildLogger {
  constructor(parent, context) {
    this.parent = parent;
    this.context = context;
  }
  parent;
  context;
  debug(message, context) {
    this.parent.debug(message, { ...this.context, ...context });
  }
  info(message, context) {
    this.parent.info(message, { ...this.context, ...context });
  }
  warn(message, context) {
    this.parent.warn(message, { ...this.context, ...context });
  }
  error(message, error, context) {
    this.parent.error(message, error, { ...this.context, ...context });
  }
  child(context) {
    return new _ChildLogger(this.parent, { ...this.context, ...context });
  }
};
function formatContext(context) {
  if (!context || Object.keys(context).length === 0) return "";
  const parts = [];
  for (const [key, value] of Object.entries(context)) {
    if (value !== void 0 && value !== null) {
      parts.push(`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}
var logger2 = new Logger();
if (process.env.MCP_TOOL_SEARCH_DEBUG === "1" || process.env.MCP_TOOL_SEARCH_DEBUG === "true") {
  logger2.setLevel("debug");
}

// src/auth/oauth-provider.ts
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

// src/auth/auth-store.ts
import { createHash } from "crypto";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync4, writeFileSync as writeFileSync2, existsSync as existsSync5, rmSync } from "fs";
import { join as join4 } from "path";
function getAuthBaseDir() {
  const override = process.env.MCP_OAUTH_DIR?.trim();
  return override ? override : getOAuthDir();
}
function getServerDir(serverName) {
  if (typeof serverName !== "string") {
    throw new Error(`Invalid MCP server name: ${JSON.stringify(serverName)}`);
  }
  const storageKey = createHash("sha256").update(serverName, "utf8").digest("hex");
  return join4(getAuthBaseDir(), `sha256-${storageKey}`);
}
function getAuthEntryFilePath(serverName) {
  return join4(getServerDir(serverName), "tokens.json");
}
function ensureServerDir(serverName) {
  const dir = getServerDir(serverName);
  if (!existsSync5(dir)) {
    mkdirSync2(dir, { recursive: true, mode: 448 });
  }
}
function readAuthEntry(serverName) {
  const filePath = getAuthEntryFilePath(serverName);
  try {
    if (!existsSync5(filePath)) {
      return void 0;
    }
    const data = readFileSync4(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read auth entry for ${serverName}:`, error);
    return void 0;
  }
}
function writeAuthEntry(serverName, entry) {
  ensureServerDir(serverName);
  const filePath = getAuthEntryFilePath(serverName);
  writeFileSync2(filePath, JSON.stringify(entry, null, 2), { mode: 384 });
}
function getAuthEntry(serverName) {
  return readAuthEntry(serverName);
}
function getAuthForUrl(serverName, serverUrl) {
  const entry = getAuthEntry(serverName);
  if (!entry) return void 0;
  if (!entry.serverUrl) return void 0;
  if (entry.serverUrl !== serverUrl) return void 0;
  return entry;
}
function saveAuthEntry(serverName, entry, serverUrl) {
  if (serverUrl) {
    entry.serverUrl = serverUrl;
  }
  writeAuthEntry(serverName, entry);
}
function removeAuthEntry(serverName) {
  try {
    const filePath = getAuthEntryFilePath(serverName);
    if (existsSync5(filePath)) {
      writeFileSync2(filePath, "{}", { mode: 384 });
    }
    const dir = getServerDir(serverName);
    if (existsSync5(dir)) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
      }
    }
  } catch (error) {
    console.error(`Failed to remove auth entry for ${serverName}:`, error);
  }
}
function updateTokens(serverName, tokens, serverUrl) {
  const entry = getAuthEntry(serverName) ?? {};
  if (serverUrl && entry.serverUrl !== serverUrl) {
    delete entry.clientInfo;
    delete entry.codeVerifier;
    delete entry.oauthState;
  }
  entry.tokens = tokens;
  saveAuthEntry(serverName, entry, serverUrl);
}
function updateClientInfo(serverName, clientInfo, serverUrl) {
  const entry = getAuthEntry(serverName) ?? {};
  if (serverUrl && entry.serverUrl !== serverUrl) {
    delete entry.tokens;
    delete entry.codeVerifier;
    delete entry.oauthState;
  }
  entry.clientInfo = clientInfo;
  saveAuthEntry(serverName, entry, serverUrl);
}
function updateCodeVerifier(serverName, codeVerifier, serverUrl) {
  const entry = getAuthEntry(serverName) ?? {};
  if (serverUrl && entry.serverUrl !== serverUrl) {
    delete entry.tokens;
    delete entry.clientInfo;
    delete entry.oauthState;
  }
  entry.codeVerifier = codeVerifier;
  saveAuthEntry(serverName, entry, serverUrl);
}
function clearCodeVerifier(serverName) {
  const entry = getAuthEntry(serverName);
  if (entry) {
    delete entry.codeVerifier;
    saveAuthEntry(serverName, entry);
  }
}
function updateOAuthState(serverName, state2, serverUrl) {
  const entry = getAuthEntry(serverName) ?? {};
  if (serverUrl && entry.serverUrl !== serverUrl) {
    delete entry.tokens;
    delete entry.clientInfo;
    delete entry.codeVerifier;
  }
  entry.oauthState = state2;
  saveAuthEntry(serverName, entry, serverUrl);
}
function getOAuthState(serverName) {
  const entry = getAuthEntry(serverName);
  return entry?.oauthState;
}
function clearOAuthState(serverName) {
  const entry = getAuthEntry(serverName);
  if (entry) {
    delete entry.oauthState;
    saveAuthEntry(serverName, entry);
  }
}
function clearAllCredentials(serverName) {
  removeAuthEntry(serverName);
}
function clearClientInfo(serverName) {
  const entry = getAuthEntry(serverName);
  if (entry) {
    delete entry.clientInfo;
    saveAuthEntry(serverName, entry);
  }
}
function clearTokens(serverName) {
  const entry = getAuthEntry(serverName);
  if (entry) {
    delete entry.tokens;
    saveAuthEntry(serverName, entry);
  }
}

// src/auth/oauth-provider.ts
var DEFAULT_OAUTH_CALLBACK_PORT = 19876;
var DEFAULT_OAUTH_CALLBACK_PATH = "/callback";
var configuredOAuthCallbackPort = DEFAULT_OAUTH_CALLBACK_PORT;
if (process.env.MCP_OAUTH_CALLBACK_PORT) {
  const parsedPort = Number.parseInt(process.env.MCP_OAUTH_CALLBACK_PORT, 10);
  if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
    configuredOAuthCallbackPort = parsedPort;
  }
}
var oauthCallbackPort = configuredOAuthCallbackPort;
var oauthCallbackPath = DEFAULT_OAUTH_CALLBACK_PATH;
function getConfiguredOAuthCallbackPort() {
  return configuredOAuthCallbackPort;
}
function getOAuthCallbackPort() {
  return oauthCallbackPort;
}
function setOAuthCallbackPort(port) {
  oauthCallbackPort = port;
}
function getOAuthCallbackPath() {
  return oauthCallbackPath;
}
function setOAuthCallbackPath(path) {
  oauthCallbackPath = path.startsWith("/") ? path : `/${path}`;
}
var McpOAuthProvider = class {
  constructor(serverName, serverUrl, config, callbacks) {
    this.serverName = serverName;
    this.serverUrl = serverUrl;
    this.config = config;
    this.callbacks = callbacks;
    this.redirectUrlSnapshot = config.grantType === "client_credentials" ? void 0 : config.redirectUri ?? `http://localhost:${getOAuthCallbackPort()}${getOAuthCallbackPath()}`;
  }
  serverName;
  serverUrl;
  config;
  callbacks;
  redirectUrlSnapshot;
  get usesClientCredentials() {
    return this.config.grantType === "client_credentials";
  }
  /**
   * The redirect URL for OAuth callbacks.
   * This must match the redirect_uri in client metadata.
   */
  get redirectUrl() {
    return this.redirectUrlSnapshot;
  }
  /**
   * Client metadata for dynamic registration.
   * Describes this client to the OAuth authorization server.
   */
  get clientMetadata() {
    if (this.usesClientCredentials) {
      return {
        client_name: this.config.clientName ?? "mcp-tool-search",
        client_uri: this.config.clientUri ?? "https://github.com/nicobailon/mcp-tool-search",
        redirect_uris: [],
        grant_types: ["client_credentials"],
        token_endpoint_auth_method: this.config.clientSecret ? "client_secret_post" : "none"
      };
    }
    const redirectUrl = this.redirectUrl;
    if (!redirectUrl) {
      throw new Error("redirectUrl is required for authorization_code flow");
    }
    return {
      redirect_uris: [redirectUrl],
      client_name: this.config.clientName ?? "mcp-tool-search",
      client_uri: this.config.clientUri ?? "https://github.com/nicobailon/mcp-tool-search",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.config.clientSecret ? "client_secret_post" : "none",
      ...this.config.scope !== void 0 ? { scope: this.config.scope } : {}
    };
  }
  /**
   * Get client information (for pre-registered or dynamically registered clients).
   * Returns undefined if no client info exists or if the server URL has changed.
   */
  async clientInformation() {
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      };
    }
    const entry = await getAuthForUrl(this.serverName, this.serverUrl);
    if (entry?.clientInfo) {
      if (entry.clientInfo.clientSecretExpiresAt && entry.clientInfo.clientSecretExpiresAt < Date.now() / 1e3) {
        return void 0;
      }
      return {
        client_id: entry.clientInfo.clientId,
        client_secret: entry.clientInfo.clientSecret
      };
    }
    return void 0;
  }
  /**
   * Save client information from dynamic registration.
   */
  async saveClientInformation(info) {
    const redirectUris = info.redirect_uris ?? (this.redirectUrl ? [this.redirectUrl] : void 0);
    const clientInfo = {
      clientId: info.client_id,
      clientSecret: info.client_secret,
      clientIdIssuedAt: info.client_id_issued_at,
      clientSecretExpiresAt: info.client_secret_expires_at,
      redirectUris
    };
    updateClientInfo(this.serverName, clientInfo, this.serverUrl);
  }
  /**
   * Get stored OAuth tokens.
   * Returns undefined if no tokens exist or if the server URL has changed.
   */
  async tokens() {
    const entry = await getAuthForUrl(this.serverName, this.serverUrl);
    if (!entry?.tokens) return void 0;
    return {
      access_token: entry.tokens.accessToken,
      token_type: "Bearer",
      refresh_token: entry.tokens.refreshToken,
      expires_in: entry.tokens.expiresAt ? Math.max(0, Math.floor(entry.tokens.expiresAt - Date.now() / 1e3)) : void 0,
      scope: entry.tokens.scope
    };
  }
  /**
   * Save OAuth tokens.
   */
  async saveTokens(tokens) {
    const storedTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() / 1e3 + tokens.expires_in : void 0,
      scope: tokens.scope
    };
    updateTokens(this.serverName, storedTokens, this.serverUrl);
  }
  /**
   * Redirect the user to the authorization URL.
   * This opens the browser for the user to authenticate.
   *
   * Throws UnauthorizedError when called outside of a user-initiated flow
   * (no oauthState saved by startAuth). That path is reached when the SDK
   * falls through from a failed refresh into a fresh authorization_code
   * flow, which library hosts cannot complete in-process.
   */
  async redirectToAuthorization(authorizationUrl) {
    if (this.usesClientCredentials) {
      throw new Error("redirectToAuthorization is not used for client_credentials flow");
    }
    const entry = await getAuthForUrl(this.serverName, this.serverUrl);
    if (!entry?.oauthState) {
      throw new UnauthorizedError(
        `Re-authentication required for MCP server: ${this.serverName}`
      );
    }
    await this.callbacks.onRedirect(authorizationUrl);
  }
  /**
   * Save the PKCE code verifier.
   */
  async saveCodeVerifier(codeVerifier) {
    updateCodeVerifier(this.serverName, codeVerifier, this.serverUrl);
  }
  /**
   * Get the stored PKCE code verifier.
   * @throws Error if no code verifier is stored
   */
  async codeVerifier() {
    if (this.usesClientCredentials) {
      throw new Error("codeVerifier is not used for client_credentials flow");
    }
    const entry = await getAuthForUrl(this.serverName, this.serverUrl);
    if (!entry?.codeVerifier) {
      throw new Error(`No code verifier saved for MCP server: ${this.serverName}`);
    }
    return entry.codeVerifier;
  }
  /**
   * Save the OAuth state parameter for CSRF protection.
   */
  async saveState(state2) {
    updateOAuthState(this.serverName, state2, this.serverUrl);
  }
  /**
   * Get the stored OAuth state parameter.
   * @throws UnauthorizedError if no flow is in progress (see redirectToAuthorization)
   */
  async state() {
    if (this.usesClientCredentials) {
      throw new Error("state is not used for client_credentials flow");
    }
    const entry = await getAuthForUrl(this.serverName, this.serverUrl);
    if (!entry?.oauthState) {
      throw new UnauthorizedError(
        `Re-authentication required for MCP server: ${this.serverName}`
      );
    }
    return entry.oauthState;
  }
  /**
   * Invalidate credentials when authentication fails.
   * Clears tokens, client info, or all credentials based on the type.
   */
  async invalidateCredentials(type) {
    switch (type) {
      case "all":
        clearAllCredentials(this.serverName);
        break;
      case "client":
        clearClientInfo(this.serverName);
        break;
      case "tokens":
        clearTokens(this.serverName);
        break;
    }
  }
  /**
   * Adds configured authorization-code scope without replacing the SDK's
   * default token endpoint authentication behavior.
   */
  addClientAuthentication = async (headers, params, _url, metadata) => {
    if (params.get("grant_type") === "authorization_code" && !params.has("scope") && this.config.scope) {
      params.set("scope", this.config.scope);
    }
    const clientInfo = await this.clientInformation();
    if (!clientInfo) {
      return;
    }
    const supportedMethods = metadata?.token_endpoint_auth_methods_supported ?? [];
    const hasClientSecret = clientInfo.client_secret !== void 0;
    let authMethod;
    if (supportedMethods.length === 0) {
      authMethod = hasClientSecret ? "client_secret_post" : "none";
    } else if (hasClientSecret && supportedMethods.includes("client_secret_basic")) {
      authMethod = "client_secret_basic";
    } else if (hasClientSecret && supportedMethods.includes("client_secret_post")) {
      authMethod = "client_secret_post";
    } else if (supportedMethods.includes("none")) {
      authMethod = "none";
    } else {
      authMethod = hasClientSecret ? "client_secret_post" : "none";
    }
    if (authMethod === "client_secret_basic") {
      if (!clientInfo.client_secret) {
        throw new Error("client_secret_basic authentication requires a client_secret");
      }
      headers.set("Authorization", `Basic ${Buffer.from(`${clientInfo.client_id}:${clientInfo.client_secret}`).toString("base64")}`);
      return;
    }
    if (!params.has("client_id")) {
      params.set("client_id", clientInfo.client_id);
    }
    if (authMethod === "client_secret_post" && clientInfo.client_secret && !params.has("client_secret")) {
      params.set("client_secret", clientInfo.client_secret);
    }
  };
  prepareTokenRequest(scope) {
    if (!this.usesClientCredentials) {
      return void 0;
    }
    const params = new URLSearchParams({ grant_type: "client_credentials" });
    const requestedScope = scope ?? this.config.scope;
    if (requestedScope) {
      params.set("scope", requestedScope);
    }
    return params;
  }
};

// src/auth/oauth-flow.ts
import {
  auth as runSdkAuth,
  UnauthorizedError as UnauthorizedError2
} from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import open from "open";

// src/auth/callback-server.ts
import { createServer } from "http";
var HTML_SUCCESS = `<!DOCTYPE html>
<html>
<head>
  <title>mcp-tool-search - Authorization Successful</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #4ade80; margin-bottom: 1rem; }
    p { color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Successful</h1>
    <p>You can close this window and return to your MCP client.</p>
  </div>
  <script>setTimeout(() => window.close(), 2000);</script>
</body>
</html>`;
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var HTML_ERROR = (error) => `<!DOCTYPE html>
<html>
<head>
  <title>mcp-tool-search - Authorization Failed</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #f87171; margin-bottom: 1rem; }
    p { color: #aaa; }
    .error { color: #fca5a5; font-family: monospace; margin-top: 1rem; padding: 1rem; background: rgba(248,113,113,0.1); border-radius: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Failed</h1>
    <p>An error occurred during authorization.</p>
    <div class="error">${escapeHtml(error)}</div>
  </div>
</body>
</html>`;
var server;
var bindingPromise;
var pendingAuths = /* @__PURE__ */ new Map();
var reservedAuthStates = /* @__PURE__ */ new Set();
var CALLBACK_TIMEOUT_MS = 5 * 60 * 1e3;
var DEFAULT_OAUTH_CALLBACK_HOST = "localhost";
var callbackServerHost = DEFAULT_OAUTH_CALLBACK_HOST;
function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname !== getOAuthCallbackPath()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const code = url.searchParams.get("code");
  const state2 = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (!state2) {
    const errorMsg = "Missing required state parameter - potential CSRF attack";
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(HTML_ERROR(errorMsg));
    return;
  }
  const pending = pendingAuths.get(state2);
  const isReserved = reservedAuthStates.has(state2);
  if (error) {
    if (!pending && !isReserved) {
      const errorMsg2 = "Invalid or expired state parameter - potential CSRF attack";
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(HTML_ERROR(errorMsg2));
      return;
    }
    const errorMsg = errorDescription || error;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_ERROR(errorMsg));
    reservedAuthStates.delete(state2);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingAuths.delete(state2);
      setTimeout(() => pending.reject(new Error(errorMsg)), 0);
    }
    return;
  }
  if (!pending) {
    const errorMsg = "Invalid or expired state parameter - potential CSRF attack";
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(HTML_ERROR(errorMsg));
    return;
  }
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(HTML_ERROR("No authorization code provided"));
    return;
  }
  clearTimeout(pending.timeout);
  pendingAuths.delete(state2);
  pending.resolve(code);
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(HTML_SUCCESS);
}
async function ensureCallbackServer(options = {}) {
  while (bindingPromise) {
    await bindingPromise;
  }
  const operation = ensureCallbackServerLocked(options);
  bindingPromise = operation;
  try {
    await operation;
  } finally {
    if (bindingPromise === operation) {
      bindingPromise = void 0;
    }
  }
}
async function ensureCallbackServerLocked(options = {}) {
  const requiredPort = options.port ?? getConfiguredOAuthCallbackPort();
  const strictPort = options.strictPort === true;
  const requestedHost = options.callbackHost ?? DEFAULT_OAUTH_CALLBACK_HOST;
  const rawRequestedPath = options.callbackPath ?? DEFAULT_OAUTH_CALLBACK_PATH;
  const requestedPath = rawRequestedPath.startsWith("/") ? rawRequestedPath : `/${rawRequestedPath}`;
  if (options.reserveState && !options.oauthState) {
    throw new Error("OAuth callback reservation requires an oauthState");
  }
  let reservedState;
  const previousServer = server;
  const needsStrictRebind = Boolean(previousServer && strictPort && getOAuthCallbackPort() !== requiredPort);
  const needsHostSwitch = Boolean(previousServer && callbackServerHost !== requestedHost);
  const needsPathSwitch = Boolean(previousServer && getOAuthCallbackPath() !== requestedPath);
  if (previousServer) {
    if (!needsStrictRebind && !needsHostSwitch) {
      if (needsPathSwitch) {
        if (pendingAuths.size > 0 || reservedAuthStates.size > 0) {
          throw new Error(
            `OAuth callback server is using path ${getOAuthCallbackPath()}, but callback path ${requestedPath} is required and cannot be switched while authorizations are pending`
          );
        }
        setOAuthCallbackPath(requestedPath);
      }
      if (options.reserveState && options.oauthState) {
        reservedAuthStates.add(options.oauthState);
        reservedState = options.oauthState;
      }
      return;
    }
    if (pendingAuths.size > 0 || reservedAuthStates.size > 0) {
      throw new Error(
        `OAuth callback server is running on ${callbackServerHost}:${getOAuthCallbackPort()}, but strict callback endpoint ${requestedHost}:${requiredPort} is required and cannot be switched while authorizations are pending`
      );
    }
  }
  const candidateServer = createServer(handleRequest);
  const listenPort = strictPort ? requiredPort : 0;
  try {
    await new Promise((resolve4, reject) => {
      candidateServer.once("error", (err) => {
        reject(err);
      });
      candidateServer.listen(listenPort, requestedHost, () => {
        resolve4();
      });
    });
    if (strictPort) {
      setOAuthCallbackPort(requiredPort);
    } else {
      const address = candidateServer.address();
      if (!address || typeof address === "string" || typeof address.port !== "number") {
        throw new Error("OAuth callback server did not report an assigned port");
      }
      setOAuthCallbackPort(address.port);
    }
    if (previousServer && (needsStrictRebind || needsHostSwitch)) {
      await new Promise((resolve4) => {
        previousServer.close(() => resolve4());
      });
    }
    callbackServerHost = requestedHost;
    setOAuthCallbackPath(requestedPath);
    server = candidateServer;
    if (options.reserveState && options.oauthState) {
      reservedAuthStates.add(options.oauthState);
      reservedState = options.oauthState;
    }
    server.unref();
  } catch (error) {
    if (reservedState) {
      reservedAuthStates.delete(reservedState);
    }
    const nodeError = error;
    await new Promise((resolve4) => {
      candidateServer.close(() => resolve4());
    });
    if (strictPort && nodeError.code === "EADDRINUSE") {
      throw new Error(
        `OAuth callback port ${requiredPort} is already in use. Pre-registered OAuth clients require an exact redirect URI; set MCP_OAUTH_CALLBACK_PORT to your registered port or free port ${requiredPort}`,
        { cause: error }
      );
    }
    throw error;
  }
}
function releaseCallbackServer(oauthState) {
  reservedAuthStates.delete(oauthState);
}
function waitForCallback(oauthState) {
  reservedAuthStates.delete(oauthState);
  return new Promise((resolve4, reject) => {
    const timeout = setTimeout(() => {
      if (pendingAuths.has(oauthState)) {
        pendingAuths.delete(oauthState);
        reject(new Error("OAuth callback timeout - authorization took too long"));
      }
    }, CALLBACK_TIMEOUT_MS);
    pendingAuths.set(oauthState, { resolve: resolve4, reject, timeout });
  });
}
function cancelPendingCallback(oauthState) {
  reservedAuthStates.delete(oauthState);
  const pending = pendingAuths.get(oauthState);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingAuths.delete(oauthState);
    pending.reject(new Error("Authorization cancelled"));
  }
}

// src/auth/oauth-flow.ts
var pendingTransports = /* @__PURE__ */ new Map();
var pendingAuthStates = /* @__PURE__ */ new Map();
var pendingAuthCleanupTimers = /* @__PURE__ */ new Map();
var pendingAuthentications = /* @__PURE__ */ new Map();
var MANUAL_AUTH_TIMEOUT_MS = 5 * 60 * 1e3;
function generateState() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function extractOAuthConfig(definition) {
  if (definition.oauth === false) {
    return {};
  }
  const config = {};
  if (definition.oauth?.grantType !== void 0) config.grantType = definition.oauth.grantType;
  if (definition.oauth?.clientId !== void 0) config.clientId = definition.oauth.clientId;
  if (definition.oauth?.clientSecret !== void 0) config.clientSecret = definition.oauth.clientSecret;
  if (definition.oauth?.scope !== void 0) config.scope = definition.oauth.scope;
  if (definition.oauth?.redirectUri !== void 0) {
    if (typeof definition.oauth.redirectUri !== "string") {
      throw new Error("OAuth redirectUri must be a string");
    }
    const redirectUri = definition.oauth.redirectUri.trim();
    if (!redirectUri) {
      throw new Error("OAuth redirectUri must not be empty");
    }
    config.redirectUri = redirectUri;
  }
  if (definition.oauth?.clientName !== void 0) {
    if (typeof definition.oauth.clientName !== "string") {
      throw new Error("OAuth clientName must be a string");
    }
    const clientName = definition.oauth.clientName.trim();
    if (!clientName) {
      throw new Error("OAuth clientName must not be empty");
    }
    config.clientName = clientName;
  }
  if (definition.oauth?.clientUri !== void 0) {
    if (typeof definition.oauth.clientUri !== "string") {
      throw new Error("OAuth clientUri must be a string");
    }
    const clientUri = definition.oauth.clientUri.trim();
    if (!clientUri) {
      throw new Error("OAuth clientUri must not be empty");
    }
    config.clientUri = clientUri;
  }
  return config;
}
function parseOAuthRedirectUri(redirectUri) {
  let url;
  try {
    url = new URL(redirectUri);
  } catch (error) {
    throw new Error(`Invalid OAuth redirectUri: ${redirectUri}`, { cause: error });
  }
  const hostname = url.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  if (url.protocol !== "http:" || !isLocalhost) {
    throw new Error("OAuth redirectUri must be an http:// localhost or loopback URI");
  }
  if (url.username || url.password) {
    throw new Error("OAuth redirectUri must not include username or password");
  }
  if (url.hash) {
    throw new Error("OAuth redirectUri must not include a fragment");
  }
  if (!url.port) {
    throw new Error("OAuth redirectUri must include an explicit numeric port");
  }
  const port = Number.parseInt(url.port, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("OAuth redirectUri must include an explicit numeric port");
  }
  const callbackHost = hostname === "[::1]" ? "::1" : hostname;
  return { port, callbackHost, callbackPath: url.pathname };
}
async function startAuth(serverName, serverUrl, definition) {
  const config = definition ? extractOAuthConfig(definition) : {};
  if (config.grantType === "client_credentials") {
    const storedAuth = await getAuthForUrl(serverName, serverUrl);
    if (storedAuth?.clientInfo && !storedAuth.tokens && !config.clientId) {
      clearClientInfo(serverName);
      clearCodeVerifier(serverName);
      await clearOAuthState(serverName);
    }
    const authProvider2 = new McpOAuthProvider(serverName, serverUrl, config, {
      onRedirect: async () => {
        throw new Error("Browser redirect is not used for client_credentials flow");
      }
    });
    const result = await runSdkAuth(authProvider2, { serverUrl });
    if (result !== "AUTHORIZED") {
      throw new UnauthorizedError2("Failed to authorize");
    }
    return { authorizationUrl: "" };
  }
  const redirectCallback = config.redirectUri !== void 0 ? parseOAuthRedirectUri(config.redirectUri) : void 0;
  const oauthState = generateState();
  try {
    await ensureCallbackServer({
      strictPort: Boolean(config.clientId) || config.redirectUri !== void 0,
      oauthState,
      reserveState: true,
      ...redirectCallback ? { port: redirectCallback.port, callbackHost: redirectCallback.callbackHost, callbackPath: redirectCallback.callbackPath } : {}
    });
  } catch (error) {
    await clearOAuthState(serverName);
    throw error;
  }
  let capturedUrl;
  const authProvider = new McpOAuthProvider(serverName, serverUrl, config, {
    onRedirect: async (url) => {
      capturedUrl = url;
    }
  });
  try {
    const storedAuth = await getAuthForUrl(serverName, serverUrl);
    if (storedAuth?.clientInfo && !config.clientId) {
      if (!storedAuth.tokens) {
        clearClientInfo(serverName);
        clearCodeVerifier(serverName);
        await clearOAuthState(serverName);
      } else {
        const redirectUris = storedAuth.clientInfo.redirectUris;
        if (!Array.isArray(redirectUris) || !redirectUris.includes(authProvider.redirectUrl ?? "")) {
          clearClientInfo(serverName);
          clearTokens(serverName);
          clearCodeVerifier(serverName);
          await clearOAuthState(serverName);
        }
      }
    }
    await updateOAuthState(serverName, oauthState, serverUrl);
    const result = await runSdkAuth(authProvider, { serverUrl });
    if (result === "AUTHORIZED") {
      releaseCallbackServer(oauthState);
      await clearOAuthState(serverName);
      return { authorizationUrl: "" };
    }
    if (!capturedUrl) {
      throw new UnauthorizedError2("OAuth authorization URL was not provided");
    }
    const pendingTransport = new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider });
    await setPendingTransport(serverName, pendingTransport, oauthState);
    return { authorizationUrl: capturedUrl.toString() };
  } catch (error) {
    await clearPendingAuth(serverName, oauthState);
    throw error;
  }
}
async function setPendingTransport(serverName, transport, oauthState) {
  await clearPendingAuth(serverName);
  pendingTransports.set(serverName, transport);
  pendingAuthStates.set(serverName, oauthState);
  const cleanupTimer = setTimeout(() => {
    void clearPendingAuth(serverName, oauthState);
  }, MANUAL_AUTH_TIMEOUT_MS);
  cleanupTimer.unref?.();
  pendingAuthCleanupTimers.set(serverName, cleanupTimer);
}
async function clearPendingAuth(serverName, oauthState) {
  const pendingState = pendingAuthStates.get(serverName);
  if (oauthState && pendingState && pendingState !== oauthState) return;
  const timer = pendingAuthCleanupTimers.get(serverName);
  if (timer) {
    clearTimeout(timer);
    pendingAuthCleanupTimers.delete(serverName);
  }
  const transport = pendingTransports.get(serverName);
  pendingTransports.delete(serverName);
  pendingAuthStates.delete(serverName);
  const stateToRelease = pendingState ?? oauthState;
  if (stateToRelease) {
    releaseCallbackServer(stateToRelease);
    const storedState = await getOAuthState(serverName);
    if (storedState === stateToRelease) {
      await clearOAuthState(serverName);
    }
  }
  if (transport) {
    await transport.close().catch(() => {
    });
  }
}
function getSearchParamsFromInput(input) {
  try {
    const url = new URL(input);
    const params = new URLSearchParams(url.search);
    if (url.hash) {
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const hashParams = new URLSearchParams(hash);
      for (const [key, value] of hashParams) {
        if (!params.has(key)) params.set(key, value);
      }
    }
    return params;
  } catch {
    const query = input.includes("?") ? input.slice(input.indexOf("?") + 1) : input;
    const params = new URLSearchParams(query.startsWith("#") ? query.slice(1) : query);
    return params.has("code") || params.has("state") || params.has("error") ? params : void 0;
  }
}
function parseAuthorizationCodeInput(input, expectedState) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Authorization code or redirect URL is required");
  }
  const params = getSearchParamsFromInput(trimmed);
  if (params) {
    const error = params.get("error");
    if (error) {
      const description = params.get("error_description");
      throw new Error(description ? `${error}: ${description}` : error);
    }
    const state2 = params.get("state");
    if (expectedState && !state2) {
      throw new Error("OAuth state missing from redirect URL");
    }
    if (expectedState && state2 !== expectedState) {
      throw new Error("OAuth state mismatch - potential CSRF attack");
    }
    const code = params.get("code");
    if (code) return code;
  }
  if (/^[A-Za-z0-9._~+/=-]+$/.test(trimmed)) {
    return trimmed;
  }
  throw new Error("Could not find an OAuth authorization code in the provided input");
}
async function completeAuthFromInput(serverName, input) {
  const oauthState = await getOAuthState(serverName);
  const code = parseAuthorizationCodeInput(input, oauthState);
  return completeAuth(serverName, code);
}
async function completeAuth(serverName, authorizationCode) {
  const transport = pendingTransports.get(serverName);
  if (!transport) {
    throw new Error(`No pending OAuth flow for server: ${serverName}`);
  }
  const oauthState = await getOAuthState(serverName);
  try {
    await transport.finishAuth(authorizationCode);
    return "authenticated";
  } finally {
    await clearPendingAuth(serverName, oauthState);
  }
}
async function authenticate(serverName, serverUrl, definition, options = {}) {
  const inFlight = pendingAuthentications.get(serverName);
  if (inFlight) {
    return inFlight;
  }
  const operation = (async () => {
    const { authorizationUrl } = await startAuth(serverName, serverUrl, definition);
    if (!authorizationUrl) {
      return "authenticated";
    }
    const oauthState = await getOAuthState(serverName);
    if (!oauthState) {
      throw new Error("OAuth state not found - this should not happen");
    }
    const callbackPromise = waitForCallback(oauthState);
    try {
      if (options.onAuthorizationUrl) {
        await options.onAuthorizationUrl(authorizationUrl);
      } else {
        console.error(`MCP Auth: Open this URL to authenticate ${serverName}:
${authorizationUrl}`);
      }
      try {
        await open(authorizationUrl);
      } catch (error) {
        console.warn(`MCP Auth: Failed to open browser for ${serverName}; waiting for manual callback`, { error });
      }
      const code = await callbackPromise;
      const storedState = await getOAuthState(serverName);
      if (storedState !== oauthState) {
        await clearOAuthState(serverName);
        throw new Error("OAuth state mismatch - potential CSRF attack");
      }
      await clearOAuthState(serverName);
      return await completeAuth(serverName, code);
    } catch (error) {
      cancelPendingCallback(oauthState);
      await clearPendingAuth(serverName, oauthState);
      throw error;
    }
  })();
  pendingAuthentications.set(serverName, operation);
  try {
    return await operation;
  } finally {
    if (pendingAuthentications.get(serverName) === operation) {
      pendingAuthentications.delete(serverName);
    }
  }
}
function supportsOAuth(definition) {
  if (!definition.url) return false;
  if (definition.auth === false) return false;
  if (definition.oauth === false) return false;
  if (definition.auth === "oauth") return true;
  if (definition.headers && Object.keys(definition.headers).length > 0) return false;
  return definition.auth === void 0;
}

// src/utils/utils.ts
async function parallelLimit(items, limit, fn) {
  if (limit <= 0) {
    limit = items.length || 1;
  }
  let index = 0;
  const results = new Array(items.length);
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array(Math.min(limit, items.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
}
function getConfigFromArgv() {
  for (const flag of ["--mcp-config", "--config"]) {
    const idx = process.argv.indexOf(flag);
    if (idx >= 0 && idx + 1 < process.argv.length) {
      return process.argv[idx + 1];
    }
  }
  return void 0;
}
function truncateAtWord(text, target) {
  if (!text || text.length <= target) return text;
  const truncated = text.slice(0, target);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > target * 0.6) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}
function resolveBearerToken(definition) {
  if (definition.bearerToken !== void 0) {
    return interpolateEnvVars(definition.bearerToken);
  }
  return definition.bearerTokenEnv ? process.env[definition.bearerTokenEnv] : void 0;
}
function formatAuthRequiredMessage(config, serverName, defaultMessage) {
  const template = config.settings?.authRequiredMessage;
  return template ? template.replaceAll("${server}", serverName) : defaultMessage;
}

// src/utils/abort.ts
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "MCP request aborted"));
}
async function abortable(promise, signal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  return await new Promise((resolve4, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "MCP request aborted")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve4(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
  });
}

// src/mcp/server-manager.ts
var McpServerManager = class {
  /** Default cwd for stdio servers without an explicit config `cwd`. */
  constructor(defaultCwd) {
    this.defaultCwd = defaultCwd;
  }
  defaultCwd;
  connections = /* @__PURE__ */ new Map();
  connectPromises = /* @__PURE__ */ new Map();
  defaultRequestTimeoutMs;
  setDefaultRequestTimeoutMs(timeoutMs) {
    this.defaultRequestTimeoutMs = normalizeRequestTimeoutMs(timeoutMs);
  }
  getRequestOptions(name, signal) {
    const connection = this.connections.get(name);
    return this.buildRequestOptions(connection?.definition, signal);
  }
  getResolvedRequestTimeoutMs(definition) {
    if (definition?.requestTimeoutMs !== void 0) {
      return normalizeRequestTimeoutMs(definition.requestTimeoutMs);
    }
    return this.defaultRequestTimeoutMs;
  }
  buildRequestOptions(definition, signal) {
    const timeout = this.getResolvedRequestTimeoutMs(definition);
    if (!signal && timeout === void 0) {
      return void 0;
    }
    return {
      ...signal ? { signal } : {},
      ...timeout !== void 0 ? { timeout } : {}
    };
  }
  async connect(name, definition, signal) {
    throwIfAborted(signal);
    if (this.connectPromises.has(name)) {
      return abortable(this.connectPromises.get(name), signal);
    }
    const existing = this.connections.get(name);
    if (existing?.status === "connected") {
      existing.lastUsedAt = Date.now();
      return existing;
    }
    const promise = this.createConnection(name, definition, signal);
    this.connectPromises.set(name, promise);
    try {
      const connection = await promise;
      this.connections.set(name, connection);
      return connection;
    } finally {
      this.connectPromises.delete(name);
    }
  }
  async createConnection(name, definition, signal) {
    throwIfAborted(signal);
    const client = this.createClient(name);
    let transport;
    if (definition.command) {
      let command = definition.command;
      let args = definition.args ?? [];
      if (command === "npx" || command === "npm") {
        const resolved = await resolveNpxBinary(command, args);
        if (resolved) {
          command = resolved.isJs ? "node" : resolved.binPath;
          args = resolved.isJs ? [resolved.binPath, ...resolved.extraArgs] : resolved.extraArgs;
          logger2.debug(`${name} resolved to ${resolved.binPath} (skipping npm parent)`);
        }
      }
      transport = new StdioClientTransport({
        command,
        args,
        env: resolveEnv(definition.env),
        cwd: resolveConfigPath(definition.cwd) ?? this.defaultCwd,
        stderr: definition.debug ? "inherit" : "ignore"
      });
    } else if (definition.url) {
      transport = await this.createHttpTransport(definition, name, signal);
    } else {
      throw new Error(`Server ${name} has no command or url`);
    }
    const requestOptions = this.buildRequestOptions(definition, signal);
    try {
      await client.connect(transport, requestOptions);
      const [tools, resources] = await Promise.all([
        this.fetchAllTools(client, requestOptions),
        this.fetchAllResources(client, requestOptions)
      ]);
      return {
        client,
        transport,
        definition,
        tools,
        resources,
        lastUsedAt: Date.now(),
        inFlight: 0,
        status: "connected"
      };
    } catch (error) {
      if (error instanceof UnauthorizedError3 && supportsOAuth(definition)) {
        await client.close().catch(() => {
        });
        await transport.close().catch(() => {
        });
        return {
          client,
          transport,
          definition,
          tools: [],
          resources: [],
          lastUsedAt: Date.now(),
          inFlight: 0,
          status: "needs-auth"
        };
      }
      await client.close().catch(() => {
      });
      await transport.close().catch(() => {
      });
      throw error;
    }
  }
  createClient(serverName) {
    const client = new Client(
      { name: `mcp-tool-search-${serverName}`, version: "1.0.0" },
      void 0
      // no capabilities — standalone mode doesn't support sampling/elicitation
    );
    return client;
  }
  async createHttpTransport(definition, serverName, signal) {
    throwIfAborted(signal);
    const url = new URL(definition.url);
    const headers = resolveHeaders(definition.headers) ?? {};
    if (definition.auth === "bearer") {
      const token = resolveBearerToken(definition);
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
    const requestInit = Object.keys(headers).length > 0 ? { headers } : void 0;
    let authProvider;
    if (supportsOAuth(definition)) {
      const oauthConfig = extractOAuthConfig(definition);
      authProvider = new McpOAuthProvider(
        serverName,
        definition.url,
        oauthConfig,
        {
          onRedirect: async (_authUrl) => {
          }
        }
      );
    }
    const streamableTransport = new StreamableHTTPClientTransport2(url, {
      requestInit,
      authProvider
    });
    try {
      const testClient = new Client({ name: "mcp-tool-search-probe", version: "2.1.2" });
      await testClient.connect(streamableTransport, this.buildRequestOptions(definition, signal));
      await testClient.close().catch(() => {
      });
      await streamableTransport.close().catch(() => {
      });
      return new StreamableHTTPClientTransport2(url, { requestInit, authProvider });
    } catch (error) {
      await streamableTransport.close().catch(() => {
      });
      if (signal?.aborted) {
        throwIfAborted(signal);
      }
      if (error instanceof UnauthorizedError3) {
        throw error;
      }
      return new SSEClientTransport(url, { requestInit, authProvider });
    }
  }
  async fetchAllTools(client, requestOptions) {
    const allTools = [];
    let cursor;
    do {
      const result = await client.listTools(cursor ? { cursor } : void 0, requestOptions);
      allTools.push(...result.tools ?? []);
      cursor = result.nextCursor;
    } while (cursor);
    return allTools;
  }
  async fetchAllResources(client, requestOptions) {
    try {
      const allResources = [];
      let cursor;
      do {
        const result = await client.listResources(cursor ? { cursor } : void 0, requestOptions);
        allResources.push(...result.resources ?? []);
        cursor = result.nextCursor;
      } while (cursor);
      return allResources;
    } catch {
      if (requestOptions?.signal?.aborted) {
        throwIfAborted(requestOptions.signal);
      }
      return [];
    }
  }
  async readResource(name, uri, signal) {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== "connected") {
      throw new Error(`Server "${name}" is not connected`);
    }
    try {
      this.touch(name);
      this.incrementInFlight(name);
      return await connection.client.readResource({ uri }, this.getRequestOptions(name, signal));
    } finally {
      this.decrementInFlight(name);
      this.touch(name);
    }
  }
  async close(name) {
    const connection = this.connections.get(name);
    if (!connection) return;
    connection.status = "closed";
    this.connections.delete(name);
    await connection.client.close().catch(() => {
    });
    await connection.transport.close().catch(() => {
    });
  }
  async closeAll() {
    const names = [...this.connections.keys()];
    await Promise.all(names.map((name) => this.close(name)));
  }
  getConnection(name) {
    return this.connections.get(name);
  }
  getAllConnections() {
    return new Map(this.connections);
  }
  touch(name) {
    const connection = this.connections.get(name);
    if (connection) {
      connection.lastUsedAt = Date.now();
    }
  }
  incrementInFlight(name) {
    const connection = this.connections.get(name);
    if (connection) {
      connection.inFlight = (connection.inFlight ?? 0) + 1;
    }
  }
  decrementInFlight(name) {
    const connection = this.connections.get(name);
    if (connection && connection.inFlight) {
      connection.inFlight--;
    }
  }
  isIdle(name, timeoutMs) {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== "connected") return false;
    if (connection.inFlight > 0) return false;
    return Date.now() - connection.lastUsedAt > timeoutMs;
  }
};
function resolveEnv(env) {
  const resolved = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== void 0) {
      resolved[key] = value;
    }
  }
  if (!env) return resolved;
  const overrides = interpolateEnvRecord(env);
  return overrides ? { ...resolved, ...overrides } : resolved;
}
function resolveHeaders(headers) {
  return interpolateEnvRecord(headers);
}
function normalizeRequestTimeoutMs(timeoutMs) {
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : void 0;
}

// src/lifecycle/lifecycle.ts
var McpLifecycleManager = class {
  manager;
  keepAliveServers = /* @__PURE__ */ new Map();
  allServers = /* @__PURE__ */ new Map();
  serverSettings = /* @__PURE__ */ new Map();
  globalIdleTimeout = 10 * 60 * 1e3;
  healthCheckInterval;
  onReconnect;
  onIdleShutdown;
  constructor(manager) {
    this.manager = manager;
  }
  /**
   * Set callback to be invoked after a successful auto-reconnect.
   * Use this to update tool metadata when a server reconnects.
   */
  setReconnectCallback(callback) {
    this.onReconnect = callback;
  }
  markKeepAlive(name, definition) {
    this.keepAliveServers.set(name, definition);
  }
  registerServer(name, definition, settings) {
    this.allServers.set(name, definition);
    if (settings?.idleTimeout !== void 0) {
      this.serverSettings.set(name, settings);
    }
  }
  setGlobalIdleTimeout(minutes) {
    this.globalIdleTimeout = minutes * 60 * 1e3;
  }
  setIdleShutdownCallback(callback) {
    this.onIdleShutdown = callback;
  }
  startHealthChecks(intervalMs = 3e4) {
    this.healthCheckInterval = setInterval(() => {
      this.checkConnections().catch((error) => {
        logger2.error("MCP: Health check failed", error instanceof Error ? error : new Error(String(error)));
      });
    }, intervalMs);
    this.healthCheckInterval.unref();
  }
  async checkConnections() {
    for (const [name, definition] of this.keepAliveServers) {
      const connection = this.manager.getConnection(name);
      if (!connection || connection.status !== "connected") {
        try {
          await this.manager.connect(name, definition);
          logger2.debug(`Reconnected to ${name}`);
          this.onReconnect?.(name);
        } catch (error) {
          logger2.error(`MCP: Failed to reconnect to ${name}:`, error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
    for (const [name] of this.allServers) {
      if (this.keepAliveServers.has(name)) continue;
      const timeout = this.getIdleTimeout(name);
      if (timeout > 0 && this.manager.isIdle(name, timeout)) {
        await this.manager.close(name);
        this.onIdleShutdown?.(name);
      }
    }
  }
  getIdleTimeout(name) {
    const perServer = this.serverSettings.get(name)?.idleTimeout;
    if (perServer !== void 0) return perServer * 60 * 1e3;
    return this.globalIdleTimeout;
  }
  async gracefulShutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = void 0;
    }
    await this.manager.closeAll();
  }
};

// src/cache/metadata-cache.ts
import { existsSync as existsSync6, readFileSync as readFileSync5, writeFileSync as writeFileSync3, renameSync as renameSync2, mkdirSync as mkdirSync3 } from "fs";
import { dirname as dirname2 } from "path";
import { createHash as createHash2 } from "crypto";

// src/config/types.ts
function getServerPrefix(serverName, mode) {
  if (mode === "none") return "";
  if (mode === "short") {
    let short = serverName.replace(/-?mcp$/i, "").replace(/-/g, "_");
    if (!short) short = "mcp";
    return short;
  }
  return serverName.replace(/-/g, "_");
}
function formatToolName(toolName, serverName, prefix) {
  const p = getServerPrefix(serverName, prefix);
  return p ? `${p}_${toolName}` : toolName;
}
function normalizeToolName(value) {
  return value.replace(/-/g, "_");
}
function isToolExcluded(toolName, serverName, prefix, excludeTools) {
  if (!Array.isArray(excludeTools) || excludeTools.length === 0) return false;
  const candidates = /* @__PURE__ */ new Set([
    normalizeToolName(toolName),
    normalizeToolName(formatToolName(toolName, serverName, prefix)),
    normalizeToolName(formatToolName(toolName, serverName, "server")),
    normalizeToolName(formatToolName(toolName, serverName, "short"))
  ]);
  for (const excluded of excludeTools) {
    if (typeof excluded !== "string") continue;
    if (candidates.has(normalizeToolName(excluded))) {
      return true;
    }
  }
  return false;
}

// src/cache/metadata-cache.ts
var CACHE_VERSION2 = 1;
var CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
function getMetadataCachePath() {
  return getCachePath();
}
function loadMetadataCache() {
  const cachePath = getMetadataCachePath();
  if (!existsSync6(cachePath)) return null;
  try {
    const raw = JSON.parse(readFileSync5(cachePath, "utf-8"));
    if (!raw || typeof raw !== "object") return null;
    if (raw.version !== CACHE_VERSION2) return null;
    if (!raw.servers || typeof raw.servers !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}
function saveMetadataCache(cache) {
  const cachePath = getMetadataCachePath();
  const dir = dirname2(cachePath);
  mkdirSync3(dir, { recursive: true });
  let merged = { version: CACHE_VERSION2, servers: {} };
  try {
    if (existsSync6(cachePath)) {
      const existing = JSON.parse(readFileSync5(cachePath, "utf-8"));
      if (existing && existing.version === CACHE_VERSION2 && existing.servers) {
        merged.servers = { ...existing.servers };
      }
    }
  } catch {
  }
  merged.version = CACHE_VERSION2;
  merged.servers = { ...merged.servers, ...cache.servers };
  const tmpPath = `${cachePath}.${process.pid}.tmp`;
  writeFileSync3(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
  renameSync2(tmpPath, cachePath);
}
function computeServerHash(definition) {
  const identity = {
    command: definition.command,
    args: definition.args,
    env: interpolateEnvRecord(definition.env),
    cwd: resolveConfigPath(definition.cwd),
    url: definition.url,
    headers: interpolateEnvRecord(definition.headers),
    auth: definition.auth,
    bearerToken: resolveBearerToken(definition),
    bearerTokenEnv: definition.bearerTokenEnv,
    exposeResources: definition.exposeResources,
    excludeTools: definition.excludeTools
  };
  const normalized = stableStringify(identity);
  return createHash2("sha256").update(normalized).digest("hex");
}
function isServerCacheValid(entry, definition, maxAgeMs = CACHE_MAX_AGE_MS) {
  if (!entry || entry.configHash !== computeServerHash(definition)) return false;
  if (!entry.cachedAt || typeof entry.cachedAt !== "number") return false;
  if (maxAgeMs > 0 && Date.now() - entry.cachedAt > maxAgeMs) return false;
  return true;
}
function reconstructToolMetadata(serverName, entry, prefix, definition) {
  const metadata = [];
  for (const tool of entry.tools ?? []) {
    if (!tool?.name) continue;
    if (isToolExcluded(tool.name, serverName, prefix, definition.excludeTools)) {
      continue;
    }
    metadata.push({
      name: formatToolName(tool.name, serverName, prefix),
      originalName: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
      uiResourceUri: tool.uiResourceUri
    });
  }
  if (definition.exposeResources !== false) {
    for (const resource of entry.resources ?? []) {
      if (!resource?.name || !resource?.uri) continue;
      const baseName = `get_${resourceNameToToolName(resource.name)}`;
      if (isToolExcluded(baseName, serverName, prefix, definition.excludeTools)) {
        continue;
      }
      metadata.push({
        name: formatToolName(baseName, serverName, prefix),
        originalName: baseName,
        description: resource.description ?? `Read resource: ${resource.uri}`,
        resourceUri: resource.uri
      });
    }
  }
  return metadata;
}
function serializeTools(tools) {
  return tools.filter((t) => t?.name).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
    // uiResourceUri not extracted in standalone mode
  }));
}
function serializeResources(resources) {
  return resources.filter((r) => r?.name && r?.uri).map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description
  }));
}
function resourceNameToToolName(name) {
  let result = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+/, "").replace(/_+$/, "").toLowerCase();
  if (!result || /^\d/.test(result)) {
    result = "resource" + (result ? "_" + result : "");
  }
  return result;
}
function stableStringify(value) {
  if (value === null || value === void 0 || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === void 0 ? "undefined" : serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

// src/cache/tool-metadata.ts
function buildToolMetadata(tools, resources, definition, serverName, prefix) {
  const metadata = [];
  const failedTools = [];
  for (const tool of tools) {
    if (!tool?.name) {
      failedTools.push("(unnamed)");
      continue;
    }
    if (isToolExcluded(tool.name, serverName, prefix, definition.excludeTools)) {
      continue;
    }
    metadata.push({
      name: formatToolName(tool.name, serverName, prefix),
      originalName: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
      uiResourceUri: void 0
      // Not extracted in standalone mode
    });
  }
  if (definition.exposeResources !== false) {
    for (const resource of resources) {
      const baseName = `get_${resourceNameToToolName2(resource.name)}`;
      if (isToolExcluded(baseName, serverName, prefix, definition.excludeTools)) {
        continue;
      }
      metadata.push({
        name: formatToolName(baseName, serverName, prefix),
        originalName: baseName,
        description: resource.description ?? `Read resource: ${resource.uri}`,
        resourceUri: resource.uri
      });
    }
  }
  return { metadata, failedTools };
}
function getToolNames(state2, serverName) {
  return state2.toolMetadata.get(serverName)?.map((m) => m.name) ?? [];
}
function findToolByName(metadata, toolName) {
  if (!metadata) return void 0;
  const exact = metadata.find((m) => m.name === toolName);
  if (exact) return exact;
  const normalized = toolName.replace(/-/g, "_");
  return metadata.find((m) => m.name.replace(/-/g, "_") === normalized);
}
function formatSchema(schema, indent = "  ") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return `${indent}(no schema)`;
  }
  const s = schema;
  if (s.type === "object" && s.properties && typeof s.properties === "object" && !Array.isArray(s.properties)) {
    const props = s.properties;
    const required = Array.isArray(s.required) ? s.required.filter((name) => typeof name === "string") : [];
    if (Object.keys(props).length === 0) {
      return `${indent}(no parameters)`;
    }
    const lines2 = [];
    for (const [name, propSchema] of Object.entries(props)) {
      lines2.push(...formatProperty(name, propSchema, required.includes(name), indent));
    }
    return lines2.join("\n");
  }
  const lines = formatNestedSchema(s, indent);
  if (lines.length > 0) {
    return lines.join("\n");
  }
  const typeStr = formatType(s);
  if (typeStr) {
    return `${indent}(${typeStr})`;
  }
  return `${indent}(complex schema)`;
}
function formatProperty(name, schema, required, indent) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return [`${indent}${name}${required ? " *required*" : ""}`];
  }
  const s = schema;
  const parts = [`${indent}${name}`];
  const typeStr = formatType(s);
  if (typeStr) parts.push(`(${typeStr})`);
  if (required) parts.push("*required*");
  appendSchemaAnnotations(parts, s);
  return [parts.join(" "), ...formatNestedSchema(s, `${indent}  `)];
}
function formatNestedSchema(schema, indent) {
  const lines = [];
  if (Array.isArray(schema.anyOf)) {
    lines.push(...formatVariants("anyOf", schema.anyOf, indent));
  }
  if (Array.isArray(schema.oneOf)) {
    lines.push(...formatVariants("oneOf", schema.oneOf, indent));
  }
  if (schema.items !== void 0) {
    lines.push(...formatProperty("items", schema.items, false, indent));
  }
  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    const required = Array.isArray(schema.required) ? schema.required.filter((name) => typeof name === "string") : [];
    for (const [name, propSchema] of Object.entries(schema.properties)) {
      lines.push(...formatProperty(name, propSchema, required.includes(name), indent));
    }
  }
  return lines;
}
function formatVariants(keyword, variants, indent) {
  const lines = [`${indent}${keyword}:`];
  for (const variant of variants) {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
      lines.push(`${indent}  - ${JSON.stringify(variant)}`);
      continue;
    }
    const s = variant;
    const typeStr = formatType(s) || "schema";
    const parts = [`${indent}  - ${typeStr}`];
    appendSchemaAnnotations(parts, s);
    lines.push(parts.join(" "));
    lines.push(...formatNestedSchema(s, `${indent}    `));
  }
  return lines;
}
function formatType(schema) {
  if (Object.hasOwn(schema, "const")) {
    return `const ${JSON.stringify(schema.const)}`;
  }
  if (Array.isArray(schema.enum)) {
    return `enum: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`;
  }
  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => String(type)).join(" | ");
  }
  if (schema.type) {
    return String(schema.type);
  }
  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    return "object";
  }
  if (schema.items !== void 0) {
    return "array";
  }
  return "";
}
function appendSchemaAnnotations(parts, schema) {
  if (schema.description && typeof schema.description === "string") {
    parts.push(`- ${schema.description}`);
  }
  for (const key of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "format", "pattern"]) {
    if (schema[key] !== void 0) {
      parts.push(`[${key}: ${JSON.stringify(schema[key])}]`);
    }
  }
  if (schema.default !== void 0) {
    parts.push(`[default: ${JSON.stringify(schema.default)}]`);
  }
}
function resourceNameToToolName2(name) {
  let result = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+/, "").replace(/_+$/, "").toLowerCase();
  if (!result || /^\d/.test(result)) {
    result = "resource" + (result ? "_" + result : "");
  }
  return result;
}

// src/lifecycle/lazy-connect.ts
var FAILURE_BACKOFF_MS = 60 * 1e3;
function updateServerMetadata(state2, serverName) {
  const connection = state2.manager.getConnection(serverName);
  if (!connection || connection.status !== "connected") return;
  const definition = state2.config.mcpServers[serverName];
  if (!definition) return;
  const prefix = state2.config.settings?.toolPrefix ?? "server";
  const { metadata } = buildToolMetadata(connection.tools, connection.resources, definition, serverName, prefix);
  state2.toolMetadata.set(serverName, metadata);
}
function updateMetadataCache(state2, serverName) {
  const connection = state2.manager.getConnection(serverName);
  if (!connection || connection.status !== "connected") return;
  const definition = state2.config.mcpServers[serverName];
  if (!definition) return;
  const configHash = computeServerHash(definition);
  const existing = loadMetadataCache();
  const existingEntry = existing?.servers?.[serverName];
  const tools = serializeTools(connection.tools);
  let resources = definition.exposeResources === false ? [] : serializeResources(connection.resources);
  if (definition.exposeResources !== false && resources.length === 0 && existingEntry?.resources?.length && existingEntry.configHash === configHash) {
    resources = existingEntry.resources;
  }
  const entry = {
    configHash,
    tools,
    resources,
    cachedAt: Date.now()
  };
  saveMetadataCache({ version: 1, servers: { [serverName]: entry } });
}
function flushMetadataCache(state2) {
  for (const [name, connection] of state2.manager.getAllConnections()) {
    if (connection.status === "connected") {
      updateMetadataCache(state2, name);
    }
  }
}
function getFailureAgeSeconds(state2, serverName) {
  const failedAt = state2.failureTracker.get(serverName);
  if (!failedAt) return null;
  const ageMs = Date.now() - failedAt;
  if (ageMs > FAILURE_BACKOFF_MS) return null;
  return Math.round(ageMs / 1e3);
}
async function lazyConnect(state2, serverName, signal) {
  const connection = state2.manager.getConnection(serverName);
  if (connection?.status === "needs-auth") {
    return false;
  }
  if (connection?.status === "connected") {
    updateServerMetadata(state2, serverName);
    return true;
  }
  const failedAgo = getFailureAgeSeconds(state2, serverName);
  if (failedAgo !== null) return false;
  const definition = state2.config.mcpServers[serverName];
  if (!definition) return false;
  try {
    const newConnection = await state2.manager.connect(serverName, definition, signal);
    if (newConnection.status === "needs-auth") {
      return false;
    }
    state2.failureTracker.delete(serverName);
    updateServerMetadata(state2, serverName);
    updateMetadataCache(state2, serverName);
    return true;
  } catch (error) {
    if (signal?.aborted) {
      throwIfAborted(signal);
    }
    state2.failureTracker.set(serverName, Date.now());
    const message = error instanceof Error ? error.message : String(error);
    logger2.debug(`MCP: lazy connect failed for ${serverName}: ${message}`);
    return false;
  }
}

// src/state.ts
async function createGatewayState(options) {
  const { config, cwd, signal } = options;
  const workingDir = cwd ?? process.cwd();
  const manager = new McpServerManager(workingDir);
  manager.setDefaultRequestTimeoutMs(config.settings?.requestTimeoutMs);
  const lifecycle = new McpLifecycleManager(manager);
  const toolMetadata = /* @__PURE__ */ new Map();
  const failureTracker = /* @__PURE__ */ new Map();
  const state2 = {
    manager,
    lifecycle,
    toolMetadata,
    config,
    failureTracker
  };
  const serverEntries = Object.entries(config.mcpServers);
  if (serverEntries.length === 0) {
    return state2;
  }
  const idleSetting = typeof config.settings?.idleTimeout === "number" ? config.settings.idleTimeout : 10;
  lifecycle.setGlobalIdleTimeout(idleSetting);
  const cache = loadMetadataCache();
  if (!cache) {
    saveMetadataCache({ version: 1, servers: {} });
  }
  const prefix = config.settings?.toolPrefix ?? "server";
  for (const [name, definition] of serverEntries) {
    const lifecycleMode = definition.lifecycle ?? "lazy";
    const idleOverride = definition.idleTimeout ?? (lifecycleMode === "eager" ? 0 : void 0);
    lifecycle.registerServer(
      name,
      definition,
      idleOverride !== void 0 ? { idleTimeout: idleOverride } : void 0
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
  const startupServers = serverEntries.filter(([, definition]) => {
    const mode = definition.lifecycle ?? "lazy";
    return mode === "keep-alive" || mode === "eager";
  });
  if (startupServers.length > 0) {
    logger2.info(`MCP: connecting to ${startupServers.length} servers...`);
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
        logger2.error(`MCP: Failed to connect to ${name}: ${error}`);
        continue;
      }
      const connection = manager.getConnection(name);
      if (connection && connection.status === "connected") {
        updateServerMetadata(state2, name);
        updateMetadataCache(state2, name);
      }
    }
  }
  lifecycle.setReconnectCallback((serverName) => {
    updateServerMetadata(state2, serverName);
    updateMetadataCache(state2, serverName);
    failureTracker.delete(serverName);
  });
  lifecycle.setIdleShutdownCallback((serverName) => {
    logger2.debug(`${serverName} shut down (idle)`);
  });
  lifecycle.startHealthChecks();
  return state2;
}
async function shutdownGatewayState(state2) {
  await state2.lifecycle.gracefulShutdown();
}

// src/handlers/list-tools.ts
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// src/tools/tool-registrar.ts
function transformMcpContent(content) {
  return content.map((c) => {
    if (c.type === "text") {
      return { type: "text", text: c.text ?? "" };
    }
    if (c.type === "image") {
      return {
        type: "image",
        data: c.data ?? "",
        mimeType: c.mimeType ?? "image/png"
      };
    }
    if (c.type === "resource") {
      const resourceUri = c.resource?.uri ?? "(no URI)";
      const resourceContent = c.resource?.text ?? (c.resource ? JSON.stringify(c.resource) : "(no content)");
      return {
        type: "text",
        text: `[Resource: ${resourceUri}]
${resourceContent}`
      };
    }
    if (c.type === "resource_link") {
      const linkName = c.name ?? c.uri ?? "unknown";
      const linkUri = c.uri ?? "(no URI)";
      return {
        type: "text",
        text: `[Resource Link: ${linkName}]
URI: ${linkUri}`
      };
    }
    if (c.type === "audio") {
      return {
        type: "text",
        text: `[Audio content: ${c.mimeType ?? "audio/*"}]`
      };
    }
    return { type: "text", text: JSON.stringify(c) };
  });
}
function resolveMcpResultContent(result) {
  const blocks = transformMcpContent(Array.isArray(result.content) ? result.content : []);
  if (blocks.length > 0) return blocks;
  if (result.structuredContent !== void 0 && result.structuredContent !== null) {
    return [{ type: "text", text: stringifyStructuredContent(result.structuredContent) }];
  }
  return [];
}
function stringifyStructuredContent(value) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

// src/guard/output-guard.ts
import { randomBytes } from "crypto";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join as join5 } from "path";
var DEFAULT_MCP_OUTPUT_MAX_BYTES = 50 * 1024;
var DEFAULT_MCP_OUTPUT_MAX_LINES = 2e3;
var DEFAULT_MCP_DETAILS_MAX_BYTES = 16 * 1024;
var CONTENT_SUMMARY_LIMIT = 20;
var KEY_PREVIEW_LIMIT = 20;
var KEY_MAX_CHARS = 120;
function resolveMcpOutputGuardOptions(settings) {
  const configured = settings?.outputGuard;
  const tuning = typeof configured === "object" && configured !== null ? configured : void 0;
  return {
    enabled: envKillSwitch("MCP_OUTPUT_GUARD") ?? configured !== false,
    maxBytes: positiveInt(tuning?.maxBytes) ?? DEFAULT_MCP_OUTPUT_MAX_BYTES,
    maxLines: positiveInt(tuning?.maxLines) ?? DEFAULT_MCP_OUTPUT_MAX_LINES,
    detailsMaxBytes: positiveInt(tuning?.detailsMaxBytes) ?? DEFAULT_MCP_DETAILS_MAX_BYTES
  };
}
function guardedMcpDetails(guarded) {
  return {
    ...guarded.mcpResult !== void 0 ? { mcpResult: guarded.mcpResult } : {},
    ...guarded.outputGuard ? { outputGuard: guarded.outputGuard } : {}
  };
}
async function guardMcpOutput(content, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MCP_OUTPUT_MAX_BYTES;
  const maxLines = options.maxLines ?? DEFAULT_MCP_OUTPUT_MAX_LINES;
  const detailsMaxBytes = options.detailsMaxBytes ?? DEFAULT_MCP_DETAILS_MAX_BYTES;
  const prefix = options.prefix ?? "";
  const suffix = options.suffix ?? "";
  const normalizedContent = withEmptyTextFallback(
    content.length > 0 ? sanitizeContent(content) : [{ type: "text", text: options.emptyTextFallback ?? "(empty result)" }],
    options.emptyTextFallback
  );
  if (options.enabled === false) {
    return {
      content: addAffixes(normalizedContent, prefix, suffix),
      mcpResult: options.rawMcpResult
    };
  }
  const imageBlocks = normalizedContent.filter((block) => block.type === "image");
  const textOutput = normalizedContent.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  const composedOutput = `${prefix}${textOutput}${suffix}`;
  const stats = textStats(composedOutput);
  let guardedContent = addAffixes(normalizedContent, prefix, suffix);
  let outputGuard;
  if (stats.bytes > maxBytes || stats.lines > maxLines) {
    const { path: fullOutputPath, error: writeError } = await saveArtifact("output", composedOutput);
    const notice = formatTruncationNotice(stats, fullOutputPath, writeError);
    const previewBudget = reserveBudget(maxBytes, maxLines, notice);
    const preview = truncateHead(composedOutput, previewBudget.maxBytes, previewBudget.maxLines);
    const finalText = `${preview.content}

${notice}`;
    const finalStats = textStats(finalText);
    guardedContent = [{ type: "text", text: finalText }, ...imageBlocks];
    outputGuard = {
      truncated: true,
      originalBytes: stats.bytes,
      returnedBytes: finalStats.bytes,
      originalLines: stats.lines,
      returnedLines: finalStats.lines,
      ...imageBlocks.length > 0 ? { imageBlocksPassedThrough: imageBlocks.length } : {},
      fullOutputPath,
      writeError
    };
  }
  const mcpResult = options.rawMcpResult === void 0 ? void 0 : await boundMcpResult(options.rawMcpResult, detailsMaxBytes);
  return { content: guardedContent, outputGuard, mcpResult };
}
function sanitizeContent(content) {
  return content.map((block) => {
    if (block.type !== "image") return block;
    const mimeType = typeof block.mimeType === "string" && block.mimeType.trim() ? block.mimeType.trim().slice(0, 100) : "image/png";
    return { ...block, mimeType };
  });
}
function withEmptyTextFallback(content, fallback) {
  if (!fallback) return content;
  const textOutput = content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  if (textOutput) return content;
  return [{ type: "text", text: fallback }, ...content.filter((block) => block.type === "image")];
}
function addAffixes(content, prefix, suffix) {
  if (!prefix && !suffix) return content;
  const next = [...content];
  if (prefix) {
    const index = next.findIndex((block2) => block2.type === "text");
    const block = next[index];
    if (index >= 0 && block.type === "text") {
      next[index] = { ...block, text: `${prefix}${block.text}` };
    } else {
      next.unshift({ type: "text", text: prefix });
    }
  }
  if (suffix) {
    let index = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].type === "text") {
        index = i;
        break;
      }
    }
    const block = next[index];
    if (index >= 0 && block.type === "text") {
      next[index] = { ...block, text: `${block.text}${suffix}` };
    } else {
      next.push({ type: "text", text: suffix });
    }
  }
  return next;
}
function reserveBudget(maxBytes, maxLines, notice) {
  const noticeStats = textStats(`

${notice}`);
  return {
    maxBytes: Math.max(0, maxBytes - noticeStats.bytes),
    maxLines: Math.max(0, maxLines - noticeStats.lines)
  };
}
function truncateHead(text, maxBytes, maxLines) {
  const lines = text.split("\n");
  const output = [];
  let bytes = 0;
  for (const line of lines) {
    if (output.length >= maxLines) break;
    const separatorBytes = output.length > 0 ? 1 : 0;
    const lineBytes = byteLength(line);
    if (bytes + separatorBytes + lineBytes > maxBytes) {
      const remaining = maxBytes - bytes - separatorBytes;
      if (remaining > 0) {
        output.push(truncateStringToBytes(line, remaining));
      }
      break;
    }
    output.push(line);
    bytes += separatorBytes + lineBytes;
  }
  const content = output.join("\n");
  const stats = textStats(content);
  return { content, bytes: stats.bytes, lines: stats.lines };
}
function truncateStringToBytes(value, maxBytes) {
  if (byteLength(value) <= maxBytes) return value;
  const buffer = Buffer.from(value, "utf8");
  let end = Math.max(0, maxBytes);
  while (end > 0 && (buffer[end] & 192) === 128) end--;
  return buffer.subarray(0, end).toString("utf8");
}
function formatTruncationNotice(stats, fullOutputPath, writeError) {
  const base = `[MCP text output truncated: original ${stats.lines.toLocaleString()} lines / ${formatSize(stats.bytes)}.`;
  if (fullOutputPath) {
    return `${base} Full text saved to: ${fullOutputPath} \u2014 use read with offset/limit or grep to inspect.]`;
  }
  return `${base} Full output could not be saved: ${writeError ?? "unknown error"}]`;
}
async function boundMcpResult(result, detailsMaxBytes) {
  const raw = safeStringify(result);
  const rawBytes = byteLength(raw);
  if (rawBytes <= detailsMaxBytes) return result;
  return summarizeMcpResult(result, raw, rawBytes);
}
async function summarizeMcpResult(result, raw, rawBytes) {
  const { path: fullResultPath, error: resultWriteError } = await saveArtifact("mcp-result", raw);
  const record = asRecord(result);
  const content = Array.isArray(record?.content) ? record.content : [];
  const summary = {
    omitted: true,
    reason: "Raw MCP result exceeded the details size limit and was replaced with this summary to keep session context bounded.",
    isError: record?.isError === true,
    contentBlocks: content.length,
    contentSummary: summarizeContent(content),
    rawResultBytes: rawBytes,
    fullResultPath,
    resultWriteError
  };
  if (record && "structuredContent" in record) {
    summary.structuredContent = summarizeValue(record.structuredContent);
  }
  if (record && "_meta" in record) {
    summary.meta = summarizeValue(record._meta);
  }
  if (record) {
    const standard = /* @__PURE__ */ new Set(["content", "isError", "structuredContent", "_meta"]);
    const extraFields = Object.keys(record).filter((key) => !standard.has(key)).slice(0, KEY_PREVIEW_LIMIT).map((key) => ({ key: truncateKey(key), type: typeof record[key], estimatedBytes: estimateValueBytes(record[key]), omitted: true }));
    if (extraFields.length > 0) summary.extraFields = extraFields;
  }
  return summary;
}
function summarizeContent(content) {
  const summaries = content.slice(0, CONTENT_SUMMARY_LIMIT).map((block) => {
    const record = asRecord(block);
    if (!record) return { type: typeof block, omitted: true };
    if (record.type === "text") {
      const text = typeof record.text === "string" ? record.text : "";
      return { type: "text", bytes: byteLength(text), lines: textStats(text).lines, textOmitted: true };
    }
    if (record.type === "image") {
      const data = typeof record.data === "string" ? record.data : "";
      return { type: "image", mimeType: typeof record.mimeType === "string" ? record.mimeType : void 0, dataBytes: byteLength(data), dataOmitted: true };
    }
    return { type: typeof record.type === "string" ? record.type : "unknown", estimatedBytes: estimateValueBytes(record), omitted: true };
  });
  if (content.length > CONTENT_SUMMARY_LIMIT) {
    summaries.push({ type: "omitted", count: content.length - CONTENT_SUMMARY_LIMIT });
  }
  return summaries;
}
function summarizeValue(value) {
  const record = asRecord(value);
  if (!record) {
    return { type: value === null ? "null" : typeof value, estimatedBytes: estimateValueBytes(value), omitted: true };
  }
  const keys = Object.keys(record);
  return {
    type: Array.isArray(value) ? "array" : "object",
    estimatedBytes: estimateValueBytes(value),
    keyCount: keys.length,
    keysPreview: keys.slice(0, KEY_PREVIEW_LIMIT).map(truncateKey),
    omitted: true
  };
}
function estimateValueBytes(value, depth = 0) {
  if (value === null || value === void 0) return 0;
  if (typeof value === "string") return byteLength(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return byteLength(String(value));
  const record = asRecord(value);
  if (!record || depth >= 2) return 0;
  const values = Array.isArray(value) ? value.slice(0, KEY_PREVIEW_LIMIT) : Object.values(record).slice(0, KEY_PREVIEW_LIMIT);
  return values.reduce((total, item) => total + estimateValueBytes(item, depth + 1), 0);
}
function truncateKey(key) {
  return key.length <= KEY_MAX_CHARS ? key : `${key.slice(0, KEY_MAX_CHARS - 1)}\u2026`;
}
async function saveArtifact(kind, text) {
  try {
    const dir = await mkdtemp(join5(tmpdir(), "mcp-tool-search-output-"));
    const path = join5(dir, `${kind}-${randomBytes(4).toString("hex")}.txt`);
    await writeFile(path, text, { encoding: "utf8", mode: 384 });
    return { path };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function textStats(text) {
  return { bytes: byteLength(text), lines: text.length === 0 ? 0 : text.split("\n").length };
}
function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}
function positiveInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
  const integer = Math.floor(value);
  return integer > 0 ? integer : void 0;
}
function envKillSwitch(name) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return void 0;
  if (["0", "false", "no", "off"].includes(value)) return false;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  return void 0;
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

// src/tools/direct-tools.ts
var BUILTIN_NAMES = /* @__PURE__ */ new Set(["mcp"]);
function getDirectAuthRequiredMessage(state2, serverName, defaultMessage = `MCP server "${serverName}" requires OAuth authentication. Run mcp({ action: "auth-start", server: "${serverName}" }) to get a browser URL, or /mcp-auth ${serverName} in an interactive local session.`) {
  return formatAuthRequiredMessage(state2.config, serverName, defaultMessage);
}
function getDirectAuthFailedMessage(state2, serverName, message) {
  const customGuidance = state2.config.settings?.authRequiredMessage;
  if (customGuidance) {
    return `OAuth authentication failed for "${serverName}": ${message}. ${getDirectAuthRequiredMessage(state2, serverName)}`;
  }
  return `OAuth authentication failed for "${serverName}": ${message}. Run mcp({ action: "auth-start", server: "${serverName}" }) to get a browser URL, or /mcp-auth ${serverName} in an interactive local session.`;
}
async function attemptDirectAutoAuth(state2, serverName) {
  if (state2.config.settings?.autoAuth !== true) {
    return { status: "skipped" };
  }
  const definition = state2.config.mcpServers[serverName];
  if (!definition || !supportsOAuth(definition) || !definition.url) {
    return { status: "skipped" };
  }
  try {
    await authenticate(serverName, definition.url, definition);
    return { status: "success" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      message: getDirectAuthFailedMessage(state2, serverName, message)
    };
  }
}
function resolveDirectTools(config, cache, prefix, envOverride) {
  const specs = [];
  if (!cache) return specs;
  const seenNames = /* @__PURE__ */ new Set();
  const envServers = /* @__PURE__ */ new Set();
  const envTools = /* @__PURE__ */ new Map();
  if (envOverride) {
    for (let item of envOverride) {
      item = item.replace(/\/+$/, "");
      if (item.includes("/")) {
        const [server2, tool] = item.split("/", 2);
        if (server2 && tool) {
          if (!envTools.has(server2)) envTools.set(server2, /* @__PURE__ */ new Set());
          envTools.get(server2).add(tool);
        } else if (server2) {
          envServers.add(server2);
        }
      } else if (item) {
        envServers.add(item);
      }
    }
  }
  const globalDirect = config.settings?.directTools;
  for (const [serverName, definition] of Object.entries(config.mcpServers)) {
    const serverCache = cache.servers[serverName];
    if (!serverCache || !isServerCacheValid(serverCache, definition)) continue;
    let toolFilter = false;
    if (envOverride) {
      if (envServers.has(serverName)) {
        toolFilter = true;
      } else if (envTools.has(serverName)) {
        toolFilter = [...envTools.get(serverName)];
      }
    } else {
      if (definition.directTools !== void 0) {
        toolFilter = definition.directTools;
      } else if (globalDirect) {
        toolFilter = globalDirect;
      }
    }
    if (!toolFilter) continue;
    for (const tool of serverCache.tools ?? []) {
      if (toolFilter !== true && !toolFilter.includes(tool.name)) continue;
      if (isToolExcluded(tool.name, serverName, prefix, definition.excludeTools)) continue;
      const prefixedName = formatToolName(tool.name, serverName, prefix);
      if (BUILTIN_NAMES.has(prefixedName)) {
        console.warn(`MCP: skipping direct tool "${prefixedName}" (collides with builtin)`);
        continue;
      }
      if (seenNames.has(prefixedName)) {
        console.warn(`MCP: skipping duplicate direct tool "${prefixedName}" from "${serverName}"`);
        continue;
      }
      seenNames.add(prefixedName);
      specs.push({
        serverName,
        originalName: tool.name,
        prefixedName,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema
      });
    }
    if (definition.exposeResources !== false) {
      for (const resource of serverCache.resources ?? []) {
        const baseName = `get_${resourceNameToToolName3(resource.name)}`;
        if (toolFilter !== true && !toolFilter.includes(baseName)) continue;
        if (isToolExcluded(baseName, serverName, prefix, definition.excludeTools)) continue;
        const prefixedName = formatToolName(baseName, serverName, prefix);
        if (BUILTIN_NAMES.has(prefixedName)) {
          console.warn(`MCP: skipping direct resource tool "${prefixedName}" (collides with builtin)`);
          continue;
        }
        if (seenNames.has(prefixedName)) {
          console.warn(`MCP: skipping duplicate direct resource tool "${prefixedName}" from "${serverName}"`);
          continue;
        }
        seenNames.add(prefixedName);
        specs.push({
          serverName,
          originalName: baseName,
          prefixedName,
          description: resource.description ?? `Read resource: ${resource.uri}`,
          resourceUri: resource.uri
        });
      }
    }
  }
  return specs;
}
function getMissingConfiguredDirectToolServers(config, cache) {
  const missing = [];
  const globalDirect = config.settings?.directTools;
  for (const [serverName, definition] of Object.entries(config.mcpServers)) {
    const hasDirectTools = definition.directTools !== void 0 ? !!definition.directTools : !!globalDirect;
    if (!hasDirectTools) continue;
    const serverCache = cache?.servers?.[serverName];
    if (!serverCache || !isServerCacheValid(serverCache, definition)) {
      missing.push(serverName);
    }
  }
  return missing;
}
function buildProxyDescription(config, cache, directSpecs) {
  const prefix = config.settings?.toolPrefix ?? "server";
  let desc = `MCP gateway - connect to MCP servers and call their tools.
`;
  const directByServer = /* @__PURE__ */ new Map();
  for (const spec of directSpecs) {
    directByServer.set(spec.serverName, (directByServer.get(spec.serverName) ?? 0) + 1);
  }
  if (directByServer.size > 0) {
    const parts = [...directByServer.entries()].map(
      ([server2, count]) => `${server2} (${count})`
    );
    desc += `
Direct tools available (call as normal tools): ${parts.join(", ")}
`;
  }
  const serverSummaries = [];
  for (const serverName of Object.keys(config.mcpServers)) {
    const entry = cache?.servers?.[serverName];
    const definition = config.mcpServers[serverName];
    const toolCount = (entry?.tools ?? []).filter(
      (tool) => !isToolExcluded(tool.name, serverName, prefix, definition.excludeTools)
    ).length;
    const resourceCount = definition?.exposeResources !== false ? (entry?.resources ?? []).filter((resource) => {
      const baseName = `get_${resourceNameToToolName3(resource.name)}`;
      return !isToolExcluded(baseName, serverName, prefix, definition.excludeTools);
    }).length : 0;
    const totalItems = toolCount + resourceCount;
    if (totalItems === 0) continue;
    const directCount = directByServer.get(serverName) ?? 0;
    const proxyCount = totalItems - directCount;
    if (proxyCount > 0) {
      serverSummaries.push(`${serverName} (${proxyCount} tools)`);
    }
  }
  if (serverSummaries.length > 0) {
    desc += `
Servers: ${serverSummaries.join(", ")}
`;
  }
  desc += `
Usage:
`;
  desc += `  mcp({ })                              \u2192 Show server status
`;
  desc += `  mcp({ server: "name" })               \u2192 List tools from server
`;
  desc += `  mcp({ search: "query" })              \u2192 Search MCP tools by name/description
`;
  desc += `  mcp({ describe: "tool_name" })        \u2192 Show tool details and parameters
`;
  desc += `  mcp({ connect: "server-name" })       \u2192 Connect to a server and refresh metadata
`;
  desc += `  mcp({ tool: "name", args: '{"key": "value"}' })    \u2192 Call a tool (args is JSON string)
`;
  desc += `  mcp({ action: "auth-start", server: "name" })      \u2192 Start manual OAuth and get a browser URL
`;
  desc += `  mcp({ action: "auth-complete", server: "name", args: '{"redirectUrl":"..."}' }) \u2192 Complete manual OAuth
`;
  desc += `
Mode: action > tool (call) > connect > describe > search > server (list) > nothing (status)`;
  return desc;
}
function createDirectToolExecutor(getState, getInitPromise, spec) {
  return async function execute(params, signal) {
    throwIfAborted(signal);
    let state2 = getState();
    const initPromise = getInitPromise();
    if (!state2 && initPromise) {
      try {
        state2 = await initPromise;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `MCP initialization failed: ${message}` }],
          details: { error: "init_failed", message }
        };
      }
    }
    if (!state2) {
      return {
        content: [{ type: "text", text: "MCP not initialized" }],
        details: { error: "not_initialized" }
      };
    }
    let connected = await lazyConnect(state2, spec.serverName, signal);
    let autoAuthAttempted = false;
    if (!connected && state2.manager.getConnection(spec.serverName)?.status === "needs-auth") {
      autoAuthAttempted = true;
      const autoAuth = await attemptDirectAutoAuth(state2, spec.serverName);
      if (autoAuth.status === "failed") {
        return {
          content: [{ type: "text", text: autoAuth.message }],
          details: { error: "auth_required", server: spec.serverName, message: autoAuth.message }
        };
      }
      if (autoAuth.status === "success") {
        await state2.manager.close(spec.serverName);
        state2.failureTracker.delete(spec.serverName);
        connected = await lazyConnect(state2, spec.serverName, signal);
      }
    }
    if (!connected) {
      const authConnection = state2.manager.getConnection(spec.serverName);
      if (authConnection?.status === "needs-auth") {
        const message = getDirectAuthRequiredMessage(state2, spec.serverName);
        return {
          content: [{ type: "text", text: message }],
          details: { error: "auth_required", server: spec.serverName, message, autoAuthAttempted }
        };
      }
      const failedAgo = getFailureAgeSeconds(state2, spec.serverName);
      return {
        content: [{ type: "text", text: `MCP server "${spec.serverName}" not available${failedAgo !== null ? ` (failed ${failedAgo}s ago)` : ""}` }],
        details: { error: "server_unavailable", server: spec.serverName }
      };
    }
    const connection = state2.manager.getConnection(spec.serverName);
    if (!connection || connection.status !== "connected") {
      return {
        content: [{ type: "text", text: `MCP server "${spec.serverName}" not connected` }],
        details: { error: "not_connected", server: spec.serverName }
      };
    }
    const requestOptions = state2.manager.getRequestOptions?.(spec.serverName, signal) ?? (signal ? { signal } : void 0);
    const outputGuardOptions = resolveMcpOutputGuardOptions(state2.config.settings);
    try {
      state2.manager.touch(spec.serverName);
      state2.manager.incrementInFlight(spec.serverName);
      if (spec.resourceUri) {
        const result2 = await connection.client.readResource({ uri: spec.resourceUri }, requestOptions);
        const content2 = (result2.contents ?? []).map((c) => ({
          type: "text",
          text: "text" in c ? c.text : "blob" in c ? `[Binary data: ${c.mimeType ?? "unknown"}]` : JSON.stringify(c)
        }));
        const guarded2 = await guardMcpOutput(content2.length > 0 ? content2 : [{ type: "text", text: "(empty resource)" }], outputGuardOptions);
        return {
          content: guarded2.content,
          details: { server: spec.serverName, resourceUri: spec.resourceUri, ...guardedMcpDetails(guarded2) }
        };
      }
      const resultPromise = connection.client.callTool({
        name: spec.originalName,
        arguments: params ?? {}
      }, void 0, requestOptions);
      const result = await abortable(resultPromise, signal);
      if (result.isError) {
        const mcpContent = result.content ?? [];
        const content2 = transformMcpContent(mcpContent);
        const outputContent2 = content2.length > 0 ? content2 : [{ type: "text", text: "(empty result)" }];
        const schemaText = spec.inputSchema ? `

Expected parameters:
${formatSchema(spec.inputSchema)}` : "";
        const guarded2 = await guardMcpOutput(outputContent2, { ...outputGuardOptions, prefix: "Error: ", suffix: schemaText, emptyTextFallback: "Tool execution failed" });
        return {
          content: guarded2.content,
          details: { error: "tool_error", server: spec.serverName, ...guardedMcpDetails(guarded2) }
        };
      }
      const content = resolveMcpResultContent(result);
      const outputContent = content.length > 0 ? content : [{ type: "text", text: "(empty result)" }];
      const guarded = await guardMcpOutput(outputContent, { ...outputGuardOptions });
      return {
        content: guarded.content,
        details: { server: spec.serverName, tool: spec.originalName, ...guardedMcpDetails(guarded) }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const schemaText = spec.inputSchema ? `

Expected parameters:
${formatSchema(spec.inputSchema)}` : "";
      const guarded = await guardMcpOutput([{ type: "text", text: message }], { ...outputGuardOptions, prefix: "Failed to call tool: ", suffix: schemaText });
      return {
        content: guarded.content,
        details: { error: "call_failed", server: spec.serverName, ...guardedMcpDetails(guarded) }
      };
    } finally {
      state2.manager.decrementInFlight(spec.serverName);
      state2.manager.touch(spec.serverName);
    }
  };
}
function resourceNameToToolName3(name) {
  let result = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+/, "").replace(/_+$/, "").toLowerCase();
  if (!result || /^\d/.test(result)) {
    result = "resource" + (result ? "_" + result : "");
  }
  return result;
}

// src/tools/proxy-actions.ts
import { checkSync } from "recheck";
var MAX_REGEX_SEARCH_QUERY_LENGTH = 256;
var REGEX_SAFETY_CHECK_PARAMS = {
  attackTimeout: 50,
  incubationTimeout: 50,
  timeout: 250
};
function getAuthRequiredMessage(state2, serverName, defaultMessage = `Server "${serverName}" requires OAuth authentication. Run mcp({ action: "auth-start", server: "${serverName}" }) to get a browser URL.`) {
  return formatAuthRequiredMessage(state2.config, serverName, defaultMessage);
}
function getAuthFailedMessage(state2, serverName, message) {
  const customGuidance = state2.config.settings?.authRequiredMessage;
  if (customGuidance) {
    return `OAuth authentication failed for "${serverName}": ${message}. ${getAuthRequiredMessage(state2, serverName)}`;
  }
  return `OAuth authentication failed for "${serverName}": ${message}. Run mcp({ action: "auth-start", server: "${serverName}" }) to get a browser URL.`;
}
function getRedirectPort(authorizationUrl) {
  try {
    const redirectUri = new URL(authorizationUrl).searchParams.get("redirect_uri");
    if (!redirectUri) return void 0;
    const port = Number.parseInt(new URL(redirectUri).port, 10);
    return Number.isInteger(port) ? port : void 0;
  } catch {
    return void 0;
  }
}
function formatManualAuthInstructions(serverName, authorizationUrl) {
  const port = getRedirectPort(authorizationUrl);
  const portNote = port ? `
The redirect URL will use local port ${port}. On a remote server it is expected for that localhost page to fail locally; copy the address bar URL anyway.` : "";
  return [
    `MCP OAuth required for "${serverName}".`,
    "",
    "Open this URL in your local browser:",
    "",
    authorizationUrl,
    "",
    "After approving, copy the full redirected localhost URL from your browser address bar and send it back with:",
    `mcp({ action: "auth-complete", server: "${serverName}", args: '{"redirectUrl":"PASTE_REDIRECT_URL_HERE"}' })`,
    "",
    'You can also pass just the `code` query parameter as `args: \'{"code":"PASTE_CODE_HERE"}\'`.',
    portNote.trimEnd()
  ].filter(Boolean).join("\n");
}
async function attemptAutoAuth(state2, serverName) {
  if (state2.config.settings?.autoAuth !== true) {
    return { status: "skipped" };
  }
  const definition = state2.config.mcpServers[serverName];
  if (!definition || !supportsOAuth(definition) || !definition.url) {
    return { status: "skipped" };
  }
  const grantType = definition.oauth ? definition.oauth.grantType ?? "authorization_code" : "authorization_code";
  if (grantType !== "client_credentials") {
    return {
      status: "failed",
      message: getAuthRequiredMessage(
        state2,
        serverName,
        `Server "${serverName}" requires OAuth authentication. Run mcp({ action: "auth-start", server: "${serverName}" }) to get a browser URL.`
      )
    };
  }
  try {
    await authenticate(serverName, definition.url, definition);
    return { status: "success" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      message: getAuthFailedMessage(state2, serverName, message)
    };
  }
}
function executeUiMessages(_state) {
  return {
    content: [{ type: "text", text: "UI messages not available in standalone mode." }],
    details: { sessions: 0 }
  };
}
function executeStatus(state2) {
  const servers = [];
  for (const name of Object.keys(state2.config.mcpServers)) {
    const connection = state2.manager.getConnection(name);
    const metadata = state2.toolMetadata.get(name);
    const toolCount = metadata?.length ?? 0;
    const failedAgo = getFailureAgeSeconds(state2, name);
    let status = "not connected";
    if (connection?.status === "connected") {
      status = "connected";
    } else if (connection?.status === "needs-auth") {
      status = "needs-auth";
    } else if (failedAgo !== null) {
      status = "failed";
    } else if (metadata !== void 0) {
      status = "cached";
    }
    servers.push({ name, status, toolCount, failedAgo });
  }
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);
  const connectedCount = servers.filter((s) => s.status === "connected").length;
  let text = `MCP: ${connectedCount}/${servers.length} servers, ${totalTools} tools

`;
  for (const server2 of servers) {
    if (server2.status === "connected") {
      text += `\u2713 ${server2.name} (${server2.toolCount} tools)
`;
      continue;
    }
    if (server2.status === "needs-auth") {
      text += `\u26A0 ${server2.name} (needs auth)
`;
      continue;
    }
    if (server2.status === "cached") {
      text += `\u25CB ${server2.name} (${server2.toolCount} tools, cached)
`;
      continue;
    }
    if (server2.status === "failed") {
      text += `\u2717 ${server2.name} (failed ${server2.failedAgo ?? 0}s ago)
`;
      continue;
    }
    text += `\u25CB ${server2.name} (not connected)
`;
  }
  if (servers.length > 0) {
    text += `
mcp({ server: "name" }) to list tools, mcp({ search: "..." }) to search`;
  }
  return {
    content: [{ type: "text", text: text.trim() }],
    details: { mode: "status", servers, totalTools, connectedCount }
  };
}
async function executeAuthStart(state2, serverName) {
  const definition = state2.config.mcpServers[serverName];
  if (!definition) {
    return {
      content: [{ type: "text", text: `Server "${serverName}" not found. Use mcp({}) to see available servers.` }],
      details: { mode: "auth-start", error: "not_found", server: serverName }
    };
  }
  if (!definition.url || !supportsOAuth(definition)) {
    return {
      content: [{ type: "text", text: `Server "${serverName}" is not configured for OAuth over HTTP.` }],
      details: { mode: "auth-start", error: "oauth_not_supported", server: serverName }
    };
  }
  try {
    const { authorizationUrl } = await startAuth(serverName, definition.url, definition);
    if (!authorizationUrl) {
      return {
        content: [{ type: "text", text: `OAuth authentication successful for "${serverName}".` }],
        details: { mode: "auth-start", server: serverName, authenticated: true }
      };
    }
    return {
      content: [{ type: "text", text: formatManualAuthInstructions(serverName, authorizationUrl) }],
      details: { mode: "auth-start", server: serverName, authorizationUrl }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Failed to start OAuth for "${serverName}": ${message}` }],
      details: { mode: "auth-start", error: "auth_start_failed", server: serverName, message }
    };
  }
}
async function executeAuthComplete(state2, serverName, input) {
  if (!state2.config.mcpServers[serverName]) {
    return {
      content: [{ type: "text", text: `Server "${serverName}" not found. Use mcp({}) to see available servers.` }],
      details: { mode: "auth-complete", error: "not_found", server: serverName }
    };
  }
  try {
    const status = await completeAuthFromInput(serverName, input);
    if (status !== "authenticated") {
      return {
        content: [{ type: "text", text: `OAuth authentication did not complete for "${serverName}".` }],
        details: { mode: "auth-complete", error: "not_authenticated", server: serverName, status }
      };
    }
    await state2.manager.close(serverName);
    state2.failureTracker.delete(serverName);
    return {
      content: [{ type: "text", text: `OAuth authentication successful for "${serverName}". Run mcp({ connect: "${serverName}" }) to connect with the new token.` }],
      details: { mode: "auth-complete", server: serverName, authenticated: true }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Failed to complete OAuth for "${serverName}": ${message}` }],
      details: { mode: "auth-complete", error: "auth_complete_failed", server: serverName, message }
    };
  }
}
function executeDescribe(state2, toolName) {
  let serverName;
  let toolMeta;
  for (const [server2, metadata] of state2.toolMetadata.entries()) {
    const found = findToolByName(metadata, toolName);
    if (found) {
      serverName = server2;
      toolMeta = found;
      break;
    }
  }
  if (!serverName || !toolMeta) {
    return {
      content: [{ type: "text", text: `Tool "${toolName}" not found. Use mcp({ search: "..." }) to search.` }],
      details: { mode: "describe", error: "tool_not_found", requestedTool: toolName }
    };
  }
  let text = `${toolMeta.name}
`;
  text += `Server: ${serverName}
`;
  if (toolMeta.resourceUri) {
    text += `Type: Resource (reads from ${toolMeta.resourceUri})
`;
  }
  text += `
${toolMeta.description || "(no description)"}
`;
  if (toolMeta.inputSchema && !toolMeta.resourceUri) {
    text += `
Parameters:
${formatSchema(toolMeta.inputSchema)}`;
  } else if (toolMeta.resourceUri) {
    text += `
No parameters required (resource tool).`;
  } else {
    text += `
No parameters defined.`;
  }
  return {
    content: [{ type: "text", text: text.trim() }],
    details: { mode: "describe", tool: toolMeta, server: serverName }
  };
}
function executeSearch(state2, query, regex, server2, includeSchemas) {
  const showSchemas = includeSchemas !== false;
  const matches = [];
  let pattern;
  try {
    if (regex) {
      if (query.length > MAX_REGEX_SEARCH_QUERY_LENGTH) {
        return {
          content: [{ type: "text", text: `Regex query is too long; maximum length is ${MAX_REGEX_SEARCH_QUERY_LENGTH} characters.` }],
          details: { mode: "search", error: "query_too_long", query, maxLength: MAX_REGEX_SEARCH_QUERY_LENGTH }
        };
      }
      pattern = new RegExp(query, "i");
      let safety;
      try {
        safety = checkSync(query, "i", REGEX_SAFETY_CHECK_PARAMS);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: "Regex query rejected because safety analysis failed." }],
          details: { mode: "search", error: "unsafe_pattern", query, reason: message }
        };
      }
      if (safety.status !== "safe") {
        return {
          content: [{ type: "text", text: `Regex query rejected as unsafe (${safety.status}).` }],
          details: { mode: "search", error: "unsafe_pattern", query, safetyStatus: safety.status }
        };
      }
    } else {
      const terms = query.trim().split(/\s+/).filter((t) => t.length > 0);
      if (terms.length === 0) {
        return {
          content: [{ type: "text", text: "Search query cannot be empty" }],
          details: { mode: "search", error: "empty_query" }
        };
      }
      const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      pattern = new RegExp(escaped.join("|"), "i");
    }
  } catch {
    return {
      content: [{ type: "text", text: `Invalid regex: ${query}` }],
      details: { mode: "search", error: "invalid_pattern", query }
    };
  }
  for (const [serverName, metadata] of state2.toolMetadata.entries()) {
    if (server2 && serverName !== server2) continue;
    for (const tool of metadata) {
      if (pattern.test(tool.name) || pattern.test(tool.description)) {
        matches.push({
          server: serverName,
          tool
        });
      }
    }
  }
  const totalCount = matches.length;
  if (totalCount === 0) {
    const msg = server2 ? `No tools matching "${query}" in "${server2}"` : `No tools matching "${query}"`;
    return {
      content: [{ type: "text", text: msg }],
      details: { mode: "search", matches: [], count: 0, query }
    };
  }
  let text = `Found ${totalCount} tool${totalCount === 1 ? "" : "s"} matching "${query}":

`;
  for (const match of matches) {
    if (showSchemas) {
      text += `${match.tool.name}
`;
      text += `  ${match.tool.description || "(no description)"}
`;
      if (match.tool.inputSchema && !match.tool.resourceUri) {
        text += `
  Parameters:
${formatSchema(match.tool.inputSchema, "    ")}
`;
      } else if (match.tool.resourceUri) {
        text += `  No parameters (resource tool).
`;
      }
      text += "\n";
    } else {
      text += `- ${match.tool.name}`;
      if (match.tool.description) {
        text += ` - ${truncateAtWord(match.tool.description, 50)}`;
      }
      text += "\n";
    }
  }
  return {
    content: [{ type: "text", text: text.trim() }],
    details: {
      mode: "search",
      matches: matches.map((m) => ({ server: m.server, tool: m.tool.name })),
      count: totalCount,
      query
    }
  };
}
function executeList(state2, server2) {
  if (!state2.config.mcpServers[server2]) {
    return {
      content: [{ type: "text", text: `Server "${server2}" not found. Use mcp({}) to see available servers.` }],
      details: { mode: "list", server: server2, tools: [], count: 0, error: "not_found" }
    };
  }
  const metadata = state2.toolMetadata.get(server2);
  const toolNames = metadata?.map((m) => m.name) ?? [];
  const connection = state2.manager.getConnection(server2);
  if (toolNames.length === 0) {
    if (connection?.status === "connected") {
      return {
        content: [{ type: "text", text: `Server "${server2}" has no tools.` }],
        details: { mode: "list", server: server2, tools: [], count: 0 }
      };
    }
    if (metadata !== void 0) {
      return {
        content: [{ type: "text", text: `Server "${server2}" has no cached tools (not connected).` }],
        details: { mode: "list", server: server2, tools: [], count: 0, cached: true }
      };
    }
    return {
      content: [{ type: "text", text: `Server "${server2}" is configured but not connected. Use mcp({ connect: "${server2}" }) to retry.` }],
      details: { mode: "list", server: server2, tools: [], count: 0, error: "not_connected" }
    };
  }
  const cachedNote = connection?.status === "connected" ? "" : " (not connected, cached)";
  let text = `${server2} (${toolNames.length} tools${cachedNote}):

`;
  const descMap = /* @__PURE__ */ new Map();
  if (metadata) {
    for (const m of metadata) {
      descMap.set(m.name, m.description);
    }
  }
  for (const tool of toolNames) {
    const desc = descMap.get(tool) ?? "";
    const truncated = truncateAtWord(desc, 50);
    text += `- ${tool}`;
    if (truncated) text += ` - ${truncated}`;
    text += "\n";
  }
  return {
    content: [{ type: "text", text: text.trim() }],
    details: { mode: "list", server: server2, tools: toolNames, count: toolNames.length }
  };
}
async function executeConnect(state2, serverName, signal) {
  throwIfAborted(signal);
  const definition = state2.config.mcpServers[serverName];
  if (!definition) {
    return {
      content: [{ type: "text", text: `Server "${serverName}" not found. Use mcp({}) to see available servers.` }],
      details: { mode: "connect", error: "not_found", server: serverName }
    };
  }
  try {
    let connection = await state2.manager.connect(serverName, definition, signal);
    if (connection.status === "needs-auth") {
      const autoAuth = await attemptAutoAuth(state2, serverName);
      if (autoAuth.status === "failed") {
        return {
          content: [{ type: "text", text: autoAuth.message }],
          details: { mode: "connect", error: "auth_required", server: serverName, message: autoAuth.message }
        };
      }
      if (autoAuth.status === "success") {
        await state2.manager.close(serverName);
        connection = await state2.manager.connect(serverName, definition, signal);
      }
      if (connection.status === "needs-auth") {
        const message = getAuthRequiredMessage(state2, serverName);
        return {
          content: [{ type: "text", text: message }],
          details: { mode: "connect", error: "auth_required", server: serverName, message }
        };
      }
    }
    const prefix = state2.config.settings?.toolPrefix ?? "server";
    const { metadata } = buildToolMetadata(connection.tools, connection.resources, definition, serverName, prefix);
    state2.toolMetadata.set(serverName, metadata);
    updateMetadataCache(state2, serverName);
    state2.failureTracker.delete(serverName);
    return executeList(state2, serverName);
  } catch (error) {
    if (!signal?.aborted) {
      state2.failureTracker.set(serverName, Date.now());
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Failed to connect to "${serverName}": ${message}` }],
      details: { mode: "connect", error: signal?.aborted ? "aborted" : "connect_failed", server: serverName, message }
    };
  }
}
async function executeCall(state2, toolName, args, serverOverride, signal) {
  throwIfAborted(signal);
  let serverName = serverOverride;
  let toolMeta;
  let autoAuthAttempted = false;
  const prefixMode = state2.config.settings?.toolPrefix ?? "server";
  if (serverName && !state2.config.mcpServers[serverName]) {
    return {
      content: [{ type: "text", text: `Server "${serverName}" not found. Use mcp({}) to see available servers.` }],
      details: { mode: "call", error: "server_not_found", server: serverName }
    };
  }
  if (serverName) {
    toolMeta = findToolByName(state2.toolMetadata.get(serverName), toolName);
  } else {
    for (const [server2, metadata] of state2.toolMetadata.entries()) {
      const found = findToolByName(metadata, toolName);
      if (found) {
        serverName = server2;
        toolMeta = found;
        break;
      }
    }
  }
  if (serverName && !toolMeta) {
    const connected = await lazyConnect(state2, serverName, signal);
    if (connected) {
      toolMeta = findToolByName(state2.toolMetadata.get(serverName), toolName);
    } else {
      const needsAuthConnection = state2.manager.getConnection(serverName);
      if (needsAuthConnection?.status === "needs-auth") {
        if (!autoAuthAttempted) {
          autoAuthAttempted = true;
          const autoAuth = await attemptAutoAuth(state2, serverName);
          if (autoAuth.status === "failed") {
            return {
              content: [{ type: "text", text: autoAuth.message }],
              details: { mode: "call", error: "auth_required", server: serverName, message: autoAuth.message }
            };
          }
          if (autoAuth.status === "success") {
            await state2.manager.close(serverName);
            state2.failureTracker.delete(serverName);
            const connectedAfterAuth = await lazyConnect(state2, serverName, signal);
            if (connectedAfterAuth) {
              toolMeta = findToolByName(state2.toolMetadata.get(serverName), toolName);
              if (!toolMeta) {
                return {
                  content: [{ type: "text", text: `Tool "${toolName}" not found on "${serverName}" after reconnect.` }],
                  details: { mode: "call", error: "tool_not_found_after_reconnect", requestedTool: toolName }
                };
              }
            }
          }
        }
        if (!toolMeta && state2.manager.getConnection(serverName)?.status === "needs-auth") {
          const message = getAuthRequiredMessage(state2, serverName);
          return {
            content: [{ type: "text", text: message }],
            details: { mode: "call", error: "auth_required", server: serverName, message }
          };
        }
      }
      if (!toolMeta) {
        const failedAgo = getFailureAgeSeconds(state2, serverName);
        if (failedAgo !== null) {
          return {
            content: [{ type: "text", text: `Server "${serverName}" not available (last failed ${failedAgo}s ago)` }],
            details: { mode: "call", error: "server_backoff", server: serverName }
          };
        }
      }
    }
  }
  let prefixMatchedServer;
  if (!serverName && !toolMeta && prefixMode !== "none") {
    const candidates = Object.keys(state2.config.mcpServers).map((name) => ({ name, prefix: getServerPrefix(name, prefixMode) })).filter((c) => c.prefix && toolName.startsWith(c.prefix + "_")).sort((a, b) => b.prefix.length - a.prefix.length);
    for (const { name: configuredServer } of candidates) {
      const existingConnection = state2.manager.getConnection(configuredServer);
      const failedAgo = getFailureAgeSeconds(state2, configuredServer);
      if (failedAgo !== null && existingConnection?.status !== "needs-auth") continue;
      let connected = await lazyConnect(state2, configuredServer, signal);
      if (!connected && state2.manager.getConnection(configuredServer)?.status === "needs-auth" && !autoAuthAttempted) {
        autoAuthAttempted = true;
        const autoAuth = await attemptAutoAuth(state2, configuredServer);
        if (autoAuth.status === "failed") {
          return {
            content: [{ type: "text", text: autoAuth.message }],
            details: { mode: "call", error: "auth_required", server: configuredServer, message: autoAuth.message }
          };
        }
        if (autoAuth.status === "success") {
          await state2.manager.close(configuredServer);
          state2.failureTracker.delete(configuredServer);
          connected = await lazyConnect(state2, configuredServer, signal);
        }
      }
      if (!connected) continue;
      if (!prefixMatchedServer) prefixMatchedServer = configuredServer;
      toolMeta = findToolByName(state2.toolMetadata.get(configuredServer), toolName);
      if (toolMeta) {
        serverName = configuredServer;
        break;
      }
    }
  }
  if (!serverName || !toolMeta) {
    const hintServer = serverName ?? prefixMatchedServer;
    const available = hintServer ? getToolNames(state2, hintServer) : [];
    let msg = `Tool "${toolName}" not found.`;
    if (available.length > 0) {
      msg += ` Server "${hintServer}" has: ${available.join(", ")}`;
    } else {
      msg += ` Use mcp({ search: "..." }) to search.`;
    }
    return {
      content: [{ type: "text", text: msg }],
      details: { mode: "call", error: "tool_not_found", requestedTool: toolName, hintServer }
    };
  }
  let connection = state2.manager.getConnection(serverName);
  if (connection?.status === "needs-auth") {
    if (!autoAuthAttempted) {
      autoAuthAttempted = true;
      const autoAuth = await attemptAutoAuth(state2, serverName);
      if (autoAuth.status === "failed") {
        return {
          content: [{ type: "text", text: autoAuth.message }],
          details: { mode: "call", error: "auth_required", server: serverName, message: autoAuth.message }
        };
      }
      if (autoAuth.status === "success") {
        await state2.manager.close(serverName);
        state2.failureTracker.delete(serverName);
        connection = state2.manager.getConnection(serverName);
      }
    }
    if (connection?.status === "needs-auth") {
      const message = getAuthRequiredMessage(state2, serverName);
      return {
        content: [{ type: "text", text: message }],
        details: { mode: "call", error: "auth_required", server: serverName, message }
      };
    }
  }
  if (!connection || connection.status !== "connected") {
    const failedAgo = getFailureAgeSeconds(state2, serverName);
    if (failedAgo !== null) {
      return {
        content: [{ type: "text", text: `Server "${serverName}" not available (last failed ${failedAgo}s ago)` }],
        details: { mode: "call", error: "server_backoff", server: serverName }
      };
    }
    const definition = state2.config.mcpServers[serverName];
    if (!definition) {
      return {
        content: [{ type: "text", text: `Server "${serverName}" not connected` }],
        details: { mode: "call", error: "server_not_connected", server: serverName }
      };
    }
    try {
      connection = await state2.manager.connect(serverName, definition, signal);
      if (connection.status === "needs-auth") {
        if (!autoAuthAttempted) {
          autoAuthAttempted = true;
          const autoAuth = await attemptAutoAuth(state2, serverName);
          if (autoAuth.status === "failed") {
            return {
              content: [{ type: "text", text: autoAuth.message }],
              details: { mode: "call", error: "auth_required", server: serverName, message: autoAuth.message }
            };
          }
          if (autoAuth.status === "success") {
            await state2.manager.close(serverName);
            connection = await state2.manager.connect(serverName, definition, signal);
          }
        }
        if (connection.status === "needs-auth") {
          const message = getAuthRequiredMessage(state2, serverName);
          return {
            content: [{ type: "text", text: message }],
            details: { mode: "call", error: "auth_required", server: serverName, message }
          };
        }
      }
      state2.failureTracker.delete(serverName);
      updateServerMetadata(state2, serverName);
      updateMetadataCache(state2, serverName);
      toolMeta = findToolByName(state2.toolMetadata.get(serverName), toolName);
      if (!toolMeta) {
        const available = getToolNames(state2, serverName);
        const hint = available.length > 0 ? `Available tools on "${serverName}": ${available.join(", ")}` : `Server "${serverName}" has no tools.`;
        return {
          content: [{ type: "text", text: `Tool "${toolName}" not found on "${serverName}" after reconnect. ${hint}` }],
          details: { mode: "call", error: "tool_not_found_after_reconnect", requestedTool: toolName }
        };
      }
    } catch (error) {
      if (!signal?.aborted) {
        state2.failureTracker.set(serverName, Date.now());
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Failed to connect to "${serverName}": ${message}` }],
        details: { mode: "call", error: signal?.aborted ? "aborted" : "connect_failed", message }
      };
    }
  }
  const requestOptions = state2.manager.getRequestOptions?.(serverName, signal) ?? (signal ? { signal } : void 0);
  const outputGuardOptions = resolveMcpOutputGuardOptions(state2.config.settings);
  try {
    state2.manager.touch(serverName);
    state2.manager.incrementInFlight(serverName);
    if (toolMeta.resourceUri) {
      const result2 = await connection.client.readResource({ uri: toolMeta.resourceUri }, requestOptions);
      const content2 = (result2.contents ?? []).map((c) => ({
        type: "text",
        text: "text" in c ? c.text : "blob" in c ? `[Binary data: ${c.mimeType ?? "unknown"}]` : JSON.stringify(c)
      }));
      const guarded2 = await guardMcpOutput(content2.length > 0 ? content2 : [{ type: "text", text: "(empty resource)" }], outputGuardOptions);
      return {
        content: guarded2.content,
        details: { mode: "call", resourceUri: toolMeta.resourceUri, server: serverName, ...guardedMcpDetails(guarded2) }
      };
    }
    const resultPromise = connection.client.callTool({
      name: toolMeta.originalName,
      arguments: args ?? {}
    }, void 0, requestOptions);
    const result = await abortable(resultPromise, signal);
    if (result.isError) {
      const mcpContent = result.content ?? [];
      const content2 = transformMcpContent(mcpContent);
      const outputContent2 = content2.length > 0 ? content2 : [{ type: "text", text: "(empty result)" }];
      const schemaText = toolMeta.inputSchema ? `

Expected parameters:
${formatSchema(toolMeta.inputSchema)}` : "";
      const guarded2 = await guardMcpOutput(outputContent2, { ...outputGuardOptions, prefix: "Error: ", suffix: schemaText, emptyTextFallback: "Tool execution failed", rawMcpResult: result });
      return {
        content: guarded2.content,
        details: { mode: "call", error: "tool_error", ...guardedMcpDetails(guarded2) }
      };
    }
    logger.error(`[DEBUG TOOL CALL] ${serverName}/${toolMeta.originalName} raw result: ${JSON.stringify(result, null, 2).substring(0, 5e4)}`);
    const content = resolveMcpResultContent(result);
    logger.error(`[DEBUG TOOL CALL] ${serverName}/${toolMeta.originalName} content blocks: ${JSON.stringify(content, null, 2).substring(0, 1e4)}`);
    const outputContent = content.length > 0 ? content : [{ type: "text", text: "(empty result)" }];
    const guarded = await guardMcpOutput(outputContent, { ...outputGuardOptions, rawMcpResult: result });
    return {
      content: guarded.content,
      details: { mode: "call", ...guardedMcpDetails(guarded), server: serverName, tool: toolMeta.originalName }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const schemaText = toolMeta.inputSchema ? `

Expected parameters:
${formatSchema(toolMeta.inputSchema)}` : "";
    const guarded = await guardMcpOutput([{ type: "text", text: message }], { ...outputGuardOptions, prefix: "Failed to call tool: ", suffix: schemaText });
    return {
      content: guarded.content,
      details: { mode: "call", error: "call_failed", message: guarded.outputGuard ? "output truncated; see outputGuard.fullOutputPath" : message, ...guardedMcpDetails(guarded) }
    };
  } finally {
    state2.manager.decrementInFlight(serverName);
    state2.manager.touch(serverName);
  }
}

// src/tools/proxy.ts
function getProxyToolDescription(config, cache, directSpecs) {
  return buildProxyDescription(config, cache, directSpecs);
}
function getProxyToolInputSchema() {
  return {
    type: "object",
    properties: {
      tool: { type: "string", description: "Tool name to call (e.g., 'xcodebuild_list_sims')" },
      args: { type: "string", description: `Arguments as JSON string (e.g., '{"key": "value"}')` },
      connect: { type: "string", description: "Server name to connect (lazy connect + metadata refresh)" },
      describe: { type: "string", description: "Tool name to describe (shows parameters)" },
      search: { type: "string", description: "Search tools by name/description" },
      regex: { type: "boolean", description: "Treat search as regex (default: substring match)" },
      includeSchemas: { type: "boolean", description: "Include parameter schemas in search results (default: true)" },
      server: { type: "string", description: "Filter to specific server (also disambiguates tool calls)" },
      action: { type: "string", description: "Action: 'ui-messages', 'auth-start', or 'auth-complete'" }
    }
  };
}
async function executeProxy(state2, params, signal) {
  let parsedArgs;
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
  const action = params.action ?? parsedArgs?.action;
  const tool = params.tool ?? parsedArgs?.tool;
  const connect = params.connect ?? parsedArgs?.connect;
  const describe = params.describe ?? parsedArgs?.describe;
  const search = params.search ?? parsedArgs?.search;
  const server2 = params.server ?? parsedArgs?.server;
  const regex = params.regex ?? parsedArgs?.regex;
  const includeSchemas = params.includeSchemas ?? parsedArgs?.includeSchemas;
  let toolArgs = parsedArgs;
  if (!params.tool && parsedArgs && typeof parsedArgs === "object") {
    const nestedArgs = parsedArgs.args;
    if (typeof nestedArgs === "string") {
      try {
        toolArgs = JSON.parse(nestedArgs);
      } catch {
        toolArgs = void 0;
      }
    } else if (typeof nestedArgs === "object" && nestedArgs !== null) {
      toolArgs = nestedArgs;
    }
  }
  if (action === "ui-messages") {
    return executeUiMessages(state2);
  }
  if (action === "auth-start") {
    if (!server2) {
      return {
        content: [{ type: "text", text: 'auth-start requires `server`. Example: mcp({ action: "auth-start", server: "linear-server" })' }],
        details: { mode: "auth-start", error: "missing_server" }
      };
    }
    return executeAuthStart(state2, server2);
  }
  if (action === "auth-complete") {
    if (!server2) {
      return {
        content: [{ type: "text", text: "auth-complete requires `server`." }],
        details: { mode: "auth-complete", error: "missing_server" }
      };
    }
    const input = parsedArgs?.redirectUrl ?? parsedArgs?.code ?? parsedArgs?.input;
    if (typeof input !== "string" || input.trim().length === 0) {
      return {
        content: [{ type: "text", text: "auth-complete requires args with `redirectUrl`, `code`, or `input`." }],
        details: { mode: "auth-complete", error: "missing_input" }
      };
    }
    return executeAuthComplete(state2, server2, input);
  }
  if (tool) {
    return executeCall(state2, tool, toolArgs, server2, signal);
  }
  if (connect) {
    return executeConnect(state2, connect, signal);
  }
  if (describe) {
    return executeDescribe(state2, describe);
  }
  if (search) {
    return executeSearch(state2, search, regex, server2, includeSchemas);
  }
  if (server2) {
    return executeList(state2, server2);
  }
  return executeStatus(state2);
}

// src/handlers/list-tools.ts
function registerListToolsHandler(server2, state2, config) {
  server2.setRequestHandler(ListToolsRequestSchema, async () => {
    const prefix = config.settings?.toolPrefix ?? "server";
    const cache = loadMetadataCache();
    const envRaw = process.env.MCP_DIRECT_TOOLS;
    const directSpecs = envRaw === "__none__" ? [] : resolveDirectTools(
      config,
      cache,
      prefix,
      envRaw?.split(",").map((s) => s.trim()).filter(Boolean)
    );
    const missingConfigured = getMissingConfiguredDirectToolServers(config, cache);
    const shouldRegisterProxyTool = config.settings?.disableProxyTool !== true || directSpecs.length === 0 || missingConfigured.length > 0;
    const tools = [];
    for (const spec of directSpecs) {
      tools.push({
        name: spec.prefixedName,
        description: spec.description || `(MCP tool from ${spec.serverName})`,
        inputSchema: spec.inputSchema ?? { type: "object", properties: {} }
      });
    }
    if (shouldRegisterProxyTool) {
      tools.push({
        name: "mcp",
        description: getProxyToolDescription(config, cache, directSpecs),
        inputSchema: getProxyToolInputSchema()
      });
    }
    return { tools };
  });
}

// src/handlers/call-tool.ts
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
function registerCallToolHandler(server2, getState, config) {
  server2.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const state2 = getState();
    if (!state2) {
      return {
        content: [{ type: "text", text: "MCP not initialized" }],
        isError: true
      };
    }
    if (name === "mcp") {
      try {
        const result = await executeProxy(state2, args ?? {}, request.params._meta?.["abortSignal"]);
        return {
          content: result.content,
          isError: result.isError,
          _meta: result.details
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: message }],
          isError: true
        };
      }
    }
    const prefix = config.settings?.toolPrefix ?? "server";
    const cache = loadMetadataCache();
    const envRaw = process.env.MCP_DIRECT_TOOLS;
    const directSpecs = envRaw === "__none__" ? [] : resolveDirectTools(
      config,
      cache,
      prefix,
      envRaw?.split(",").map((s) => s.trim()).filter(Boolean)
    );
    const spec = directSpecs.find((s) => s.prefixedName === name);
    if (!spec) {
      return {
        content: [{ type: "text", text: `Tool "${name}" not found. Use mcp({ search: "..." }) to search.` }],
        isError: true
      };
    }
    const executor = createDirectToolExecutor(getState, async () => state2, spec);
    try {
      const result = await executor(args ?? {}, void 0);
      return {
        content: result.content,
        isError: result.isError,
        _meta: result.details
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: message }],
        isError: true
      };
    }
  });
}

// src/server.ts
var state = null;
async function startServer(overridePath) {
  const configPath = overridePath ?? getConfigFromArgv();
  const config = loadMcpConfig(configPath);
  logger2.info("MCP: starting mcp-tool-search server...");
  state = await createGatewayState({ config });
  const server2 = new Server(
    {
      name: "mcp-tool-search",
      version: "0.0.1"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  registerListToolsHandler(server2, state, config);
  registerCallToolHandler(server2, () => state, config);
  server2.oninitialized = () => {
    logger2.info("MCP: client connected");
  };
  const transport = new StdioServerTransport();
  await server2.connect(transport);
  logger2.info("MCP: server ready on stdio");
  const shutdown = async () => {
    logger2.info("MCP: shutting down...");
    if (state) {
      flushMetadataCache(state);
      await shutdownGatewayState(state);
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// src/cli.ts
async function main() {
  try {
    const configPath = getConfigFromArgv();
    await startServer(configPath ?? void 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger2.error(`Fatal error: ${message}`);
    process.exit(1);
  }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger2.error(`Unhandled error: ${message}`);
  process.exit(1);
});
//# sourceMappingURL=cli.js.map