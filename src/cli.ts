#!/usr/bin/env node
// cli.ts - CLI entry point for mcp-tool-search

import { startServer } from "./server.ts";
import { logger } from "./utils/logger.ts";
import { getConfigFromArgv } from "./utils/utils.ts";

async function main(): Promise<void> {
  try {
    const configPath = getConfigFromArgv();
    await startServer(configPath ?? undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Fatal error: ${message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Unhandled error: ${message}`);
  process.exit(1);
});
