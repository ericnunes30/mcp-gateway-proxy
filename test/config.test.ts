import { describe, it, expect, vi } from "vitest";
import {
  loadMcpConfig,
  mergeConfigs,
  mergeServerMaps,
  validateConfig,
} from "../src/config/config.ts";
import {
  getServerPrefix,
  formatToolName,
  isToolExcluded,
} from "../src/config/types.ts";

// Mock fs and config paths modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../src/config/paths.ts", () => ({
  getConfigSources: vi.fn(() => []),
}));

vi.mock("../src/config/imports.ts", () => ({
  expandImports: vi.fn((config: unknown) => config),
}));

import { existsSync, readFileSync } from "node:fs";
import { getConfigSources } from "../src/config/paths.ts";

describe("loadMcpConfig", () => {
  it("loads from valid config path", () => {
    const mockConfig = { mcpServers: { test: { command: "echo" } } };
    (getConfigSources as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { readPath: "/fake/config.json" },
    ]);
    (existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(mockConfig));

    const config = loadMcpConfig("/fake/config.json");
    expect(config.mcpServers).toHaveProperty("test");
    expect(config.mcpServers.test).toEqual({ command: "echo" });
  });

  it("returns empty config when file does not exist", () => {
    (getConfigSources as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { readPath: "/missing.json" },
    ]);
    (existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const config = loadMcpConfig("/missing.json");
    expect(config.mcpServers).toEqual({});
  });
});

describe("mergeConfigs", () => {
  it("merges server maps correctly", () => {
    const base = { mcpServers: { a: { command: "cmd1" } } };
    const next = { mcpServers: { b: { command: "cmd2" } } };
    const merged = mergeConfigs(base as any, next as any);
    expect(Object.keys(merged.mcpServers)).toEqual(["a", "b"]);
  });

  it("later overrides earlier for same server", () => {
    const base = { mcpServers: { a: { command: "cmd1", args: ["x"] } } };
    const next = { mcpServers: { a: { command: "cmd2" } } };
    const merged = mergeConfigs(base as any, next as any);
    expect(merged.mcpServers.a).toEqual({ command: "cmd2", args: ["x"] });
  });

  it("merges settings with later precedence", () => {
    const base = { mcpServers: {}, settings: { toolPrefix: "server" as const, idleTimeout: 5 } };
    const next = { mcpServers: {}, settings: { toolPrefix: "short" as const } };
    const merged = mergeConfigs(base, next);
    expect(merged.settings).toEqual({ toolPrefix: "short", idleTimeout: 5 });
  });
});

describe("mergeServerMaps", () => {
  it("handles conflicts by merging definitions", () => {
    const base = { a: { command: "cmd1", env: { KEY: "val1" } } };
    const next = { a: { args: ["--flag"], env: { KEY: "val2" } } };
    const merged = mergeServerMaps(base as any, next as any);
    expect(merged.a).toEqual({ command: "cmd1", args: ["--flag"], env: { KEY: "val2" } });
  });

  it("preserves unique servers from both maps", () => {
    const base = { a: { command: "cmd1" } };
    const next = { b: { command: "cmd2" } };
    const merged = mergeServerMaps(base as any, next as any);
    expect(Object.keys(merged)).toEqual(["a", "b"]);
  });
});

describe("validateConfig", () => {
  it("accepts valid config", () => {
    const raw = { mcpServers: { test: { command: "echo" } } };
    const config = validateConfig(raw);
    expect(config.mcpServers).toEqual({ test: { command: "echo" } });
  });

  it("rejects invalid configs and returns empty servers", () => {
    expect(validateConfig(null).mcpServers).toEqual({});
    expect(validateConfig("string").mcpServers).toEqual({});
    expect(validateConfig({ mcpServers: [] }).mcpServers).toEqual({});
  });

  it("handles mcp-servers alias", () => {
    const raw = { "mcp-servers": { test: { command: "echo" } } };
    const config = validateConfig(raw);
    expect(config.mcpServers).toEqual({ test: { command: "echo" } });
  });
});

describe("getServerPrefix", () => {
  it('returns "server" mode prefix with underscores', () => {
    expect(getServerPrefix("my-server", "server")).toBe("my_server");
  });

  it('returns empty string for "none" mode', () => {
    expect(getServerPrefix("my-server", "none")).toBe("");
  });

  it('returns short prefix for "short" mode', () => {
    expect(getServerPrefix("my-server-mcp", "short")).toBe("my_server");
    expect(getServerPrefix("my-mcp", "short")).toBe("my");
  });
});

describe("formatToolName", () => {
  it('formats with "server" prefix', () => {
    expect(formatToolName("list", "my-server", "server")).toBe("my_server_list");
  });

  it('formats with "short" prefix', () => {
    expect(formatToolName("list", "my-server-mcp", "short")).toBe("my_server_list");
  });

  it('formats with "none" prefix', () => {
    expect(formatToolName("list", "my-server", "none")).toBe("list");
  });
});

describe("isToolExcluded", () => {
  it("returns false when no exclusions", () => {
    expect(isToolExcluded("list", "server", "server", undefined)).toBe(false);
    expect(isToolExcluded("list", "server", "server", [])).toBe(false);
  });

  it("matches exact tool name", () => {
    expect(isToolExcluded("list", "server", "server", ["server_list"])).toBe(true);
  });

  it("matches normalized hyphenated names", () => {
    expect(isToolExcluded("list-items", "server", "server", ["server_list_items"])).toBe(true);
    expect(isToolExcluded("list_items", "server", "server", ["server_list_items"])).toBe(true);
  });

  it("does not match unrelated tools", () => {
    expect(isToolExcluded("list", "server", "server", ["server_delete"])).toBe(false);
  });
});
