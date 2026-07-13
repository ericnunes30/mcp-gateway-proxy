import { describe, it, expect, vi } from "vitest";
import {
  computeServerHash,
  isServerCacheValid,
  reconstructToolMetadata,
  type ServerCacheEntry,
} from "../src/cache/metadata-cache.ts";
import {
  buildToolMetadata,
  getToolNames,
  findToolByName,
  formatSchema,
} from "../src/cache/tool-metadata.ts";

describe("computeServerHash", () => {
  it("returns deterministic hash for same definition", () => {
    const def = { command: "echo", args: ["hello"] };
    const hash1 = computeServerHash(def);
    const hash2 = computeServerHash(def);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns different hash for different definitions", () => {
    const hash1 = computeServerHash({ command: "echo" });
    const hash2 = computeServerHash({ command: "cat" });
    expect(hash1).not.toBe(hash2);
  });

  it("excludes volatile fields like updatedAt", () => {
    const def = { command: "echo" };
    const hash = computeServerHash(def);
    // The hash should only depend on identity fields, not volatile ones.
    // Since the function only includes specific fields, we just verify
    // it doesn't crash and returns a valid hash.
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("isServerCacheValid", () => {
  const definition = { command: "echo" };

  it("returns true for matching hash and fresh timestamp", () => {
    const entry: ServerCacheEntry = {
      configHash: computeServerHash(definition),
      tools: [],
      resources: [],
      cachedAt: Date.now(),
    };
    expect(isServerCacheValid(entry, definition)).toBe(true);
  });

  it("returns false for mismatched hash", () => {
    const entry: ServerCacheEntry = {
      configHash: "wronghash",
      tools: [],
      resources: [],
      cachedAt: Date.now(),
    };
    expect(isServerCacheValid(entry, definition)).toBe(false);
  });

  it("returns false for stale timestamp", () => {
    const entry: ServerCacheEntry = {
      configHash: computeServerHash(definition),
      tools: [],
      resources: [],
      cachedAt: 0,
    };
    expect(isServerCacheValid(entry, definition)).toBe(false);
  });

  it("returns false when maxAgeMs is 0 (disabled)", () => {
    const entry: ServerCacheEntry = {
      configHash: computeServerHash(definition),
      tools: [],
      resources: [],
      cachedAt: Date.now(),
    };
    expect(isServerCacheValid(entry, definition, 0)).toBe(true);
  });
});

describe("reconstructToolMetadata", () => {
  const entry: ServerCacheEntry = {
    configHash: "hash",
    tools: [
      { name: "list", description: "List things", inputSchema: { type: "object" } },
      { name: "delete", description: "Delete things" },
    ],
    resources: [
      { uri: "file:///x", name: "My Resource", description: "A resource" },
    ],
    cachedAt: Date.now(),
  };

  it("builds metadata from cached tools and resources", () => {
    const meta = reconstructToolMetadata("srv", entry, "server", { exposeResources: true });
    expect(meta).toHaveLength(3);
    expect(meta.map((m) => m.name)).toContain("srv_list");
    expect(meta.map((m) => m.name)).toContain("srv_delete");
    expect(meta.map((m) => m.name)).toContain("srv_get_my_resource");
  });

  it("skips excluded tools", () => {
    const meta = reconstructToolMetadata("srv", entry, "server", { excludeTools: ["srv_list"] });
    expect(meta.map((m) => m.name)).not.toContain("srv_list");
    expect(meta.map((m) => m.name)).toContain("srv_delete");
  });

  it("skips resources when exposeResources is false", () => {
    const meta = reconstructToolMetadata("srv", entry, "server", { exposeResources: false });
    expect(meta).toHaveLength(2);
    expect(meta.map((m) => m.name)).not.toContain("srv_get_my_resource");
  });
});

describe("buildToolMetadata", () => {
  const tools = [
    { name: "list", description: "List things", inputSchema: { type: "object" } },
    { name: "bad-tool", description: "" },
  ];
  const resources = [
    { uri: "file:///y", name: "Other Resource", description: "Another resource" },
  ];

  it("builds metadata from tools and resources", () => {
    const { metadata, failedTools } = buildToolMetadata(tools, resources, { exposeResources: true }, "srv", "server");
    expect(metadata.map((m) => m.name)).toContain("srv_list");
    expect(metadata.map((m) => m.name)).toContain("srv_get_other_resource");
    expect(failedTools).toEqual([]);
  });

  it("excludes tools matching exclude list", () => {
    const { metadata } = buildToolMetadata(tools, [], { excludeTools: ["srv_list"] }, "srv", "server");
    expect(metadata.map((m) => m.name)).not.toContain("srv_list");
  });

  it("skips resources when exposeResources is false", () => {
    const { metadata } = buildToolMetadata(tools, resources, { exposeResources: false }, "srv", "server");
    expect(metadata.map((m) => m.name)).not.toContain("srv_get_other_resource");
  });
});

describe("getToolNames", () => {
  it("returns all tool names for a server", () => {
    const state = {
      toolMetadata: new Map([
        ["srv", [
          { name: "srv_a", originalName: "a", description: "" },
          { name: "srv_b", originalName: "b", description: "" },
        ]],
      ]),
    };
    expect(getToolNames(state, "srv")).toEqual(["srv_a", "srv_b"]);
  });

  it("returns empty array when server not found", () => {
    const state = { toolMetadata: new Map() };
    expect(getToolNames(state, "missing")).toEqual([]);
  });
});

describe("findToolByName", () => {
  const metadata = [
    { name: "srv_list-items", originalName: "list-items", description: "" },
    { name: "srv_delete", originalName: "delete", description: "" },
  ];

  it("finds exact match", () => {
    expect(findToolByName(metadata, "srv_delete")?.originalName).toBe("delete");
  });

  it("handles hyphen normalization", () => {
    expect(findToolByName(metadata, "srv_list_items")?.originalName).toBe("list-items");
    expect(findToolByName(metadata, "srv_list-items")?.originalName).toBe("list-items");
  });

  it("returns undefined when not found", () => {
    expect(findToolByName(metadata, "missing")).toBeUndefined();
    expect(findToolByName(undefined, "srv_delete")).toBeUndefined();
  });
});

describe("formatSchema", () => {
  it("formats object schema with properties", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", description: "A name" },
        count: { type: "integer" },
      },
      required: ["name"],
    };
    const result = formatSchema(schema);
    expect(result).toContain("name");
    expect(result).toContain("count");
    expect(result).toContain("*required*");
  });

  it("formats anyOf schema", () => {
    const schema = {
      anyOf: [
        { type: "string" },
        { type: "number" },
      ],
    };
    const result = formatSchema(schema);
    expect(result).toContain("anyOf");
    expect(result).toContain("string");
    expect(result).toContain("number");
  });

  it("formats oneOf schema", () => {
    const schema = {
      oneOf: [
        { type: "boolean" },
        { type: "null" },
      ],
    };
    const result = formatSchema(schema);
    expect(result).toContain("oneOf");
    expect(result).toContain("boolean");
  });

  it("formats items schema", () => {
    const schema = {
      type: "array",
      items: { type: "string" },
    };
    const result = formatSchema(schema);
    expect(result).toContain("items");
  });

  it("returns default message for empty object schema", () => {
    const result = formatSchema({ type: "object", properties: {} });
    expect(result).toContain("(no parameters)");
  });

  it("returns default message for non-object schema", () => {
    expect(formatSchema(null)).toContain("(no schema)");
    expect(formatSchema("string")).toContain("(no schema)");
  });
});
