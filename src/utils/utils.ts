import type { McpConfig, ServerEntry } from "../config/types.ts";
import { interpolateEnvVars } from "./env.ts";

export async function parallelLimit<T, R = void>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (limit <= 0) {
    limit = items.length || 1;
  }
  let index = 0;
  const results: R[] = new Array(items.length);

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

export function getConfigFromArgv(): string | undefined {
  // Support both --config and --mcp-config flags
  for (const flag of ["--mcp-config", "--config"]) {
    const idx = process.argv.indexOf(flag);
    if (idx >= 0 && idx + 1 < process.argv.length) {
      return process.argv[idx + 1];
    }
  }
  return undefined;
}

export function truncateAtWord(text: string, target: number): string {
  if (!text || text.length <= target) return text;

  const truncated = text.slice(0, target);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > target * 0.6) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

export function resolveBearerToken(definition: ServerEntry): string | undefined {
  if (definition.bearerToken !== undefined) {
    return interpolateEnvVars(definition.bearerToken);
  }
  return definition.bearerTokenEnv ? process.env[definition.bearerTokenEnv] : undefined;
}

export function formatAuthRequiredMessage(
  config: McpConfig,
  serverName: string,
  defaultMessage: string,
): string {
  const template = config.settings?.authRequiredMessage;
  return template ? template.replaceAll("${server}", serverName) : defaultMessage;
}
