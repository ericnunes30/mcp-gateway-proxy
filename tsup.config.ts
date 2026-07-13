import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "node",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  external: [
    "@modelcontextprotocol/sdk",
    "open",
    "recheck",
    "typebox",
    "zod",
  ],
});
