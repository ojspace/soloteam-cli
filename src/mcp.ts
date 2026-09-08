import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { homePath } from "./agents";

const McpServerSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(["stdio", "http", "sse"]).default("stdio"),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  url: z.string().optional(),
  headers: z.record(z.string()).default({}),
});

export type McpServer = z.infer<typeof McpServerSchema>;

const McpFileSchema = z.object({
  servers: z.array(McpServerSchema).default([]),
});

export function mcpFilePath(root: string): string {
  return join(root, "mcp.yaml");
}

/** Load `mcp.yaml` from the sync root. [] when absent (MCP sync is opt-in). */
export async function loadMcpServers(root: string): Promise<McpServer[]> {
  const path = mcpFilePath(root);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  const parsed = McpFileSchema.parse(parseYaml(raw));
  return parsed.servers.filter((server) => {
    if (server.transport === "stdio") return Boolean(server.command);
    return Boolean(server.url);
  });
}

// ─── Shared JSON shape (Claude Code + Cursor) ───────────────────────────────

interface JsonMcpEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
  headers?: Record<string, string>;
}

function toJsonEntry(server: McpServer): JsonMcpEntry {
  if (server.transport === "stdio") {
    const entry: JsonMcpEntry = {};
    if (server.command !== undefined) entry.command = server.command;
    if (server.args.length > 0) entry.args = server.args;
    if (Object.keys(server.env).length > 0) entry.env = server.env;
    return entry;
  }
  const entry: JsonMcpEntry = { type: server.transport };
  if (server.url !== undefined) entry.url = server.url;
  if (Object.keys(server.headers).length > 0) entry.headers = server.headers;
  return entry;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJson(path: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Merge servers into a `{ mcpServers: {...} }` JSON file. Returns names written. */
export async function injectJsonMcp(path: string, servers: McpServer[]): Promise<string[]> {
  const data = await readJson(path);
  const table = (data.mcpServers ?? {}) as Record<string, unknown>;
  for (const server of servers) table[server.name] = toJsonEntry(server);
  data.mcpServers = table;
  await writeJson(path, data);
  return servers.map((server) => server.name);
}

/** Remove soloteam-declared server names from a `{ mcpServers }` JSON file. */
export async function removeJsonMcp(path: string, names: string[]): Promise<number> {
  const data = await readJson(path);
  const table = (data.mcpServers ?? {}) as Record<string, unknown>;
  let removed = 0;
  for (const name of names) {
    if (name in table) {
      delete table[name];
      removed++;
    }
  }
  await writeJson(path, data);
  return removed;
}

// ─── OpenCode (opencode.json: { mcp: { name: { type: local/remote, ... } } }) ─

export function opencodeConfigPath(): string {
  return homePath(".config", "opencode", "opencode.json");
}

export async function injectOpencodeMcp(servers: McpServer[]): Promise<string[]> {
  const path = opencodeConfigPath();
  const data = await readJson(path);
  const table = (data.mcp ?? {}) as Record<string, unknown>;
  for (const server of servers) {
    table[server.name] =
      server.transport === "stdio"
        ? {
            type: "local",
            command: [server.command, ...server.args],
            ...(Object.keys(server.env).length > 0 ? { environment: server.env } : {}),
          }
        : {
            type: "remote",
            url: server.url,
            ...(Object.keys(server.headers).length > 0 ? { headers: server.headers } : {}),
          };
  }
  data.mcp = table;
  await writeJson(path, data);
  return servers.map((server) => server.name);
}

export async function removeOpencodeMcp(names: string[]): Promise<number> {
  const path = opencodeConfigPath();
  const data = await readJson(path);
  const table = (data.mcp ?? {}) as Record<string, unknown>;
  let removed = 0;
  for (const name of names) {
    if (name in table) {
      delete table[name];
      removed++;
    }
  }
  await writeJson(path, data);
  return removed;
}

// ─── Codex (config.toml managed block) ──────────────────────────────────────

export const CODEX_BEGIN = "# soloteam:begin (managed — do not edit)";
export const CODEX_END = "# soloteam:end";

export function codexConfigPath(): string {
  return homePath(".codex", "config.toml");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function buildCodexBlock(servers: McpServer[]): string {
  const lines = [CODEX_BEGIN];
  for (const server of servers) {
    const header = `[mcp_servers.${tomlString(server.name)}]`;
    lines.push("", header);
    if (server.transport === "stdio") {
      lines.push(`command = ${tomlString(server.command as string)}`);
      if (server.args.length > 0) {
        lines.push(`args = [${server.args.map(tomlString).join(", ")}]`);
      }
      const envKeys = Object.keys(server.env);
      if (envKeys.length > 0) {
        lines.push(`[mcp_servers.${tomlString(server.name)}.env]`);
        for (const key of envKeys) lines.push(`${tomlKey(key)} = ${tomlString(server.env[key] as string)}`);
      }
    } else {
      lines.push(`url = ${tomlString(server.url as string)}`);
      const headerKeys = Object.keys(server.headers);
      if (headerKeys.length > 0) {
        lines.push(`[mcp_servers.${tomlString(server.name)}.headers]`);
        for (const key of headerKeys) lines.push(`${tomlKey(key)} = ${tomlString(server.headers[key] as string)}`);
      }
    }
  }
  lines.push("", CODEX_END);
  return `${lines.join("\n")}\n`;
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

/** Replace (or append) the managed block in Codex's config.toml. */
export async function injectCodexMcp(servers: McpServer[]): Promise<string[]> {
  const path = codexConfigPath();
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  const block = buildCodexBlock(servers);
  const pattern = new RegExp(`${escapeRegExp(CODEX_BEGIN)}[\\s\\S]*?${escapeRegExp(CODEX_END)}\\n?`);
  const next = pattern.test(existing)
    ? existing.replace(pattern, block)
    : `${existing}${existing.endsWith("\n") || existing === "" ? "" : "\n"}\n${block}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, "utf8");
  return servers.map((server) => server.name);
}

export async function removeCodexMcp(): Promise<boolean> {
  const path = codexConfigPath();
  if (!existsSync(path)) return false;
  const existing = await readFile(path, "utf8");
  const pattern = new RegExp(`${escapeRegExp(CODEX_BEGIN)}[\\s\\S]*?${escapeRegExp(CODEX_END)}\\n?`);
  if (!pattern.test(existing)) return false;
  await writeFile(path, existing.replace(pattern, ""), "utf8");
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Agent dispatch ─────────────────────────────────────────────────────────

export function claudeJsonPath(): string {
  return homePath(".claude.json");
}

export function cursorMcpPath(): string {
  return homePath(".cursor", "mcp.json");
}

export interface McpInjectResult {
  agent: string;
  path: string;
  servers: string[];
}

/** Inject declared servers into every installed agent with a known MCP format. */
export async function injectMcpEverywhere(servers: McpServer[], agentIds?: string[]): Promise<McpInjectResult[]> {
  const want = (id: string): boolean => !agentIds || agentIds.includes(id);
  const results: McpInjectResult[] = [];
  if (servers.length === 0) return results;

  if (want("claude") && existsSync(homePath(".claude"))) {
    const path = claudeJsonPath();
    results.push({ agent: "claude", path, servers: await injectJsonMcp(path, servers) });
  }
  if (want("cursor") && existsSync(homePath(".cursor"))) {
    const path = cursorMcpPath();
    results.push({ agent: "cursor", path, servers: await injectJsonMcp(path, servers) });
  }
  if (want("opencode") && existsSync(homePath(".config", "opencode"))) {
    results.push({ agent: "opencode", path: opencodeConfigPath(), servers: await injectOpencodeMcp(servers) });
  }
  if (want("codex") && existsSync(homePath(".codex"))) {
    results.push({ agent: "codex", path: codexConfigPath(), servers: await injectCodexMcp(servers) });
  }
  return results;
}
