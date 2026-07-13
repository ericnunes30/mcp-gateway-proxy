import { describe, it, expect, vi } from "vitest";
import {
  executeStatus,
  executeSearch,
  executeDescribe,
  executeList,
} from "../src/tools/proxy-actions.ts";
import type { GatewayState } from "../src/lifecycle/lazy-connect.ts";

vi.mock("recheck", () => ({
  checkSync: vi.fn((_pattern: string, _flags: string, _opts: unknown) => ({ status: "safe" })),
}));

function mockGatewayState(partial: Partial<GatewayState> = {}): GatewayState {
  return {
    manager: {
      getConnection: vi.fn(() => undefined),
      connect: vi.fn(),
      close: vi.fn(),
      touch: vi.fn(),
      incrementInFlight: vi.fn(),
      decrementInFlight: vi.fn(),
      getRequestOptions: vi.fn(),
    } as unknown as GatewayState["manager"],
    lifecycle: {} as unknown as GatewayState["lifecycle"],
    toolMetadata: new Map(),
    config: { mcpServers: {} },
    failureTracker: new Map(),
    ...partial,
  };
}

describe("executeStatus", () => {
  it("returns server status when no servers", () => {
    const state = mockGatewayState({ config: { mcpServers: {} } });
    const result = executeStatus(state);
    expect(result.content[0].text).toContain("0/0 servers");
    expect(result.content[0].text).toContain("0 tools");
  });

  it("returns status for configured servers", () => {
    const state = mockGatewayState({
      config: { mcpServers: { srv1: { command: "echo" }, srv2: { command: "cat" } } },
      toolMetadata: new Map([
        ["srv1", [
          { name: "srv1_list", originalName: "list", description: "List" },
        ]],
      ]),
    });
    const result = executeStatus(state);
    expect(result.content[0].text).toContain("srv1");
    expect(result.content[0].text).toContain("srv2");
    expect(result.content[0].text).toContain("1 tools");
    expect(result.content[0].text).toContain("not connected");
  });
});

describe("executeSearch", () => {
  it("returns matches for substring search", () => {
    const state = mockGatewayState({
      toolMetadata: new Map([
        ["srv", [
          { name: "srv_list", originalName: "list", description: "List all items" },
          { name: "srv_delete", originalName: "delete", description: "Delete an item" },
        ]],
      ]),
    });
    const result = executeSearch(state, "list");
    expect(result.content[0].text).toContain("Found 1 tool");
    expect(result.content[0].text).toContain("srv_list");
  });

  it("returns empty for non-matching query", () => {
    const state = mockGatewayState({
      toolMetadata: new Map([
        ["srv", [
          { name: "srv_list", originalName: "list", description: "List all items" },
        ]],
      ]),
    });
    const result = executeSearch(state, "zzz");
    expect(result.content[0].text).toContain('No tools matching "zzz"');
    expect(result.details?.count).toBe(0);
  });

  it("filters by server when specified", () => {
    const state = mockGatewayState({
      toolMetadata: new Map([
        ["srv1", [
          { name: "srv1_list", originalName: "list", description: "List" },
        ]],
        ["srv2", [
          { name: "srv2_list", originalName: "list", description: "List" },
        ]],
      ]),
    });
    const result = executeSearch(state, "list", false, "srv1");
    expect(result.content[0].text).toContain("Found 1 tool");
    expect(result.details?.matches).toEqual([{ server: "srv1", tool: "srv1_list" }]);
  });

  it("rejects empty query", () => {
    const state = mockGatewayState();
    const result = executeSearch(state, "   ");
    expect(result.content[0].text).toBe("Search query cannot be empty");
  });
});

describe("executeDescribe", () => {
  it("returns tool description and schema", () => {
    const state = mockGatewayState({
      toolMetadata: new Map([
        ["srv", [
          { name: "srv_list", originalName: "list", description: "List things", inputSchema: { type: "object", properties: { id: { type: "string" } } } },
        ]],
      ]),
    });
    const result = executeDescribe(state, "srv_list");
    expect(result.content[0].text).toContain("srv_list");
    expect(result.content[0].text).toContain("Server: srv");
    expect(result.content[0].text).toContain("List things");
    expect(result.content[0].text).toContain("Parameters");
  });

  it("returns error when tool not found", () => {
    const state = mockGatewayState();
    const result = executeDescribe(state, "missing");
    expect(result.content[0].text).toContain('Tool "missing" not found');
    expect(result.details?.error).toBe("tool_not_found");
  });

  it("handles hyphen normalization", () => {
    const state = mockGatewayState({
      toolMetadata: new Map([
        ["srv", [
          { name: "srv_list-things", originalName: "list-things", description: "List things" },
        ]],
      ]),
    });
    const result = executeDescribe(state, "srv_list_things");
    expect(result.content[0].text).toContain("srv_list-things");
  });

  it("describes resource tools without parameters", () => {
    const state = mockGatewayState({
      toolMetadata: new Map([
        ["srv", [
          { name: "srv_get_file", originalName: "get_file", description: "Read file", resourceUri: "file:///x" },
        ]],
      ]),
    });
    const result = executeDescribe(state, "srv_get_file");
    expect(result.content[0].text).toContain("Type: Resource");
    expect(result.content[0].text).toContain("No parameters required");
  });
});

describe("executeList", () => {
  it("lists tools for a server", () => {
    const state = mockGatewayState({
      config: { mcpServers: { srv: { command: "echo" } } },
      toolMetadata: new Map([
        ["srv", [
          { name: "srv_list", originalName: "list", description: "List things" },
          { name: "srv_delete", originalName: "delete", description: "Delete things" },
        ]],
      ]),
    });
    const result = executeList(state, "srv");
    expect(result.content[0].text).toContain("srv (2 tools");
    expect(result.content[0].text).toContain("srv_list");
    expect(result.content[0].text).toContain("srv_delete");
    expect(result.details?.count).toBe(2);
  });

  it("returns not found for unknown server", () => {
    const state = mockGatewayState({ config: { mcpServers: {} } });
    const result = executeList(state, "missing");
    expect(result.content[0].text).toContain('Server "missing" not found');
    expect(result.details?.error).toBe("not_found");
  });

  it("returns not connected when no metadata", () => {
    const state = mockGatewayState({
      config: { mcpServers: { srv: { command: "echo" } } },
    });
    const result = executeList(state, "srv");
    expect(result.content[0].text).toContain('Server "srv" is configured but not connected');
    expect(result.details?.error).toBe("not_connected");
  });
});
