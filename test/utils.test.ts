import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parallelLimit,
  truncateAtWord,
  resolveBearerToken,
  formatAuthRequiredMessage,
  getConfigFromArgv,
} from "../src/utils/utils.ts";
import { interpolateEnvVars } from "../src/utils/env.ts";

describe("parallelLimit", () => {
  it("runs tasks with concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const results = await parallelLimit([1, 2, 3, 4], 2, async (item) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return item * 2;
    });

    expect(results).toEqual([2, 4, 6, 8]);
    expect(maxConcurrent).toBe(2);
  });

  it("preserves order", async () => {
    const results = await parallelLimit(
      ["a", "b", "c"],
      3,
      async (item, index) => {
        await new Promise((r) => setTimeout(r, (3 - index) * 10));
        return item;
      }
    );

    expect(results).toEqual(["a", "b", "c"]);
  });

  it("handles empty array", async () => {
    const results = await parallelLimit<number, number>([], 2, async (item) => item);
    expect(results).toEqual([]);
  });

  it("falls back to items.length when limit <= 0", async () => {
    const results = await parallelLimit([1, 2, 3], 0, async (item) => item * 2);
    expect(results).toEqual([2, 4, 6]);
  });
});

describe("truncateAtWord", () => {
  it("returns short text unchanged", () => {
    expect(truncateAtWord("hello", 100)).toBe("hello");
  });

  it("truncates at word boundary when possible", () => {
    const text = "hello world this is a test";
    const result = truncateAtWord(text, 15);
    expect(result).toBe("hello world...");
    expect(result.length).toBeLessThanOrEqual(text.length);
  });

  it("falls back to hard truncate when no good word boundary", () => {
    const text = "abcdefghijklmnopqrstuvwxyz";
    const result = truncateAtWord(text, 10);
    expect(result).toBe("abcdefghij...");
  });

  it("handles empty text", () => {
    expect(truncateAtWord("", 10)).toBe("");
  });
});

describe("interpolateEnvVars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TEST_VAR: "hello", ANOTHER: "world" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("substitutes ${VAR} with process.env values", () => {
    expect(interpolateEnvVars("${TEST_VAR}")).toBe("hello");
    expect(interpolateEnvVars("prefix-${TEST_VAR}-suffix")).toBe("prefix-hello-suffix");
  });

  it("substitutes $env:VAR syntax", () => {
    expect(interpolateEnvVars("$env:ANOTHER")).toBe("world");
  });

  it("replaces missing vars with empty string", () => {
    expect(interpolateEnvVars("${MISSING}")).toBe("");
  });

  it("handles mixed substitutions", () => {
    expect(interpolateEnvVars("${TEST_VAR} and $env:ANOTHER")).toBe("hello and world");
  });
});

describe("resolveBearerToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, BEARER_TOKEN: "secret123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns bearerToken when defined", () => {
    expect(resolveBearerToken({ bearerToken: "tok" })).toBe("tok");
  });

  it("interpolates env vars in bearerToken", () => {
    expect(resolveBearerToken({ bearerToken: "${BEARER_TOKEN}" })).toBe("secret123");
  });

  it("returns bearerTokenEnv from process.env", () => {
    expect(resolveBearerToken({ bearerTokenEnv: "BEARER_TOKEN" })).toBe("secret123");
  });

  it("returns undefined when nothing set", () => {
    expect(resolveBearerToken({})).toBeUndefined();
  });
});

describe("formatAuthRequiredMessage", () => {
  it("uses custom template when available", () => {
    const config = { mcpServers: {}, settings: { authRequiredMessage: "Auth needed for ${server}" } };
    expect(formatAuthRequiredMessage(config, "my-server", "default")).toBe("Auth needed for my-server");
  });

  it("falls back to default message", () => {
    const config = { mcpServers: {} };
    expect(formatAuthRequiredMessage(config, "my-server", "default msg")).toBe("default msg");
  });
});

describe("getConfigFromArgv", () => {
  it("parses --config flag", () => {
    const original = process.argv;
    process.argv = ["node", "script", "--config", "/path/to/config.json"];
    expect(getConfigFromArgv()).toBe("/path/to/config.json");
    process.argv = original;
  });

  it("returns undefined when flag missing", () => {
    const original = process.argv;
    process.argv = ["node", "script"];
    expect(getConfigFromArgv()).toBeUndefined();
    process.argv = original;
  });

  it("returns undefined when flag is last argument", () => {
    const original = process.argv;
    process.argv = ["node", "script", "--config"];
    expect(getConfigFromArgv()).toBeUndefined();
    process.argv = original;
  });
});
