import { describe, it, expect, vi } from "vitest";
import { guardMcpOutput } from "../src/guard/output-guard.ts";
import type { ContentBlock } from "../src/config/types.ts";

describe("guardMcpOutput", () => {
  it("truncates at 50 KiB", async () => {
    const longText = "a".repeat(60 * 1024);
    const content: ContentBlock[] = [{ type: "text", text: longText }];
    const result = await guardMcpOutput(content);
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(result.outputGuard?.truncated).toBe(true);
    expect(result.outputGuard?.originalBytes).toBeGreaterThan(50 * 1024);
    expect(result.outputGuard?.returnedBytes).toBeLessThanOrEqual(50 * 1024);
    expect(text).toContain("truncated");
  });

  it("truncates at 2000 lines", async () => {
    const manyLines = Array(2500).fill("line").join("\n");
    const content: ContentBlock[] = [{ type: "text", text: manyLines }];
    const result = await guardMcpOutput(content);
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(result.outputGuard?.truncated).toBe(true);
    expect(result.outputGuard?.originalLines).toBeGreaterThan(2000);
    expect(result.outputGuard?.returnedLines).toBeLessThanOrEqual(2000);
    expect(text).toContain("truncated");
  });

  it("passes through image blocks untouched", async () => {
    const content: ContentBlock[] = [
      { type: "text", text: "some text" },
      { type: "image", data: "base64data", mimeType: "image/png" },
    ];
    const result = await guardMcpOutput(content);
    const images = result.content.filter((c) => c.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ type: "image", data: "base64data", mimeType: "image/png" });
    expect(result.outputGuard).toBeUndefined();
  });

  it("uses empty content fallback", async () => {
    const result = await guardMcpOutput([], { emptyTextFallback: "Nothing here" });
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toBe("Nothing here");
  });

  it("returns content unchanged when under limits", async () => {
    const content: ContentBlock[] = [{ type: "text", text: "short" }];
    const result = await guardMcpOutput(content);
    expect(result.content).toEqual(content);
    expect(result.outputGuard).toBeUndefined();
  });

  it("includes image pass-through count when truncating", async () => {
    const longText = "a".repeat(60 * 1024);
    const content: ContentBlock[] = [
      { type: "text", text: longText },
      { type: "image", data: "img1" },
      { type: "image", data: "img2" },
    ];
    const result = await guardMcpOutput(content);
    expect(result.outputGuard?.imageBlocksPassedThrough).toBe(2);
    expect(result.content.filter((c) => c.type === "image")).toHaveLength(2);
  });
});
