import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { homePath } from "./agents";

/** True when the configured remote means "local-only, no git remote". */
export function isLocalRemote(remote: string): boolean {
  const trimmed = remote.trim().toLowerCase();
  return trimmed === "" || trimmed === "local" || trimmed === "none";
}

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
  servers: z
    .array(McpServerSchema)
    .nullish()
    .transform((v) => v ?? []),
});

export function mcpFilePath(root: string): string {
  return join(root, "mcp.yaml");
}

/** Load `mcp.yaml` from the sync root. [] when absent (MCP sync is opt-in). */
export async function loadMcpServers(root: string): Promise<McpServer[]> {
  const path = mcpFilePath(root);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  const parsed = McpFileSchema.parse((parseYaml(raw) ?? {}) as unknown);
  return parsed.servers.filter((server) => {
    if (server.transport === "stdio") return Boolean(server.command);
    return Boolean(server.url);
  });
}

/** Persist servers to `mcp.yaml` (sorted by name, keeps file human-editable). */
export async function saveMcpServers(root: string, servers: McpServer[]): Promise<string> {
  const path = mcpFilePath(root);
  const sorted = [...servers].sort((a, b) => a.name.localeCompare(b.name));
  const parsed = McpFileSchema.parse({ servers: sorted });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyYaml(parsed), "utf8");
  return path;
}

/** Add or replace a single server by name. Returns the file path. */
export async function upsertMcpServer(root: string, server: McpServer): Promise<string> {
  const existing = await loadMcpServers(root);
  const next = [...existing.filter((entry) => entry.name !== server.name), server];
  return saveMcpServers(root, next);
}

/** Remove a single server from `mcp.yaml` by name. Returns true when removed. */
export async function removeMcpServerFromFile(root: string, name: string): Promise<boolean> {
  const existing = await loadMcpServers(root);
  if (!existing.some((entry) => entry.name === name)) return false;
  await saveMcpServers(
    root,
    existing.filter((entry) => entry.name !== name),
  );
  return true;
}

/** Validate + normalize a raw server object (throws on bad input). */
export function parseMcpServer(raw: unknown): McpServer {
  return McpServerSchema.parse(raw);
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

// ─── Import (agent configs → mcp.yaml, no hand-editing) ──────────────────────

interface RawJsonServer {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  type?: unknown;
  url?: unknown;
  headers?: unknown;
}

function toServerFromJson(name: string, raw: RawJsonServer): McpServer | null {
  try {
    if (typeof raw.command === "string" && raw.command.length > 0) {
      return McpServerSchema.parse({
        name,
        transport: "stdio",
        command: raw.command,
        args: Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === "string") : [],
        env:
          raw.env && typeof raw.env === "object"
            ? Object.fromEntries(Object.entries(raw.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {},
      });
    }
    if (typeof raw.url === "string" && raw.url.length > 0) {
      const transport = raw.type === "sse" ? "sse" : "http";
      return McpServerSchema.parse({
        name,
        transport,
        url: raw.url,
        headers:
          raw.headers && typeof raw.headers === "object"
            ? Object.fromEntries(
                Object.entries(raw.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
              )
            : {},
      });
    }
  } catch {
    return null;
  }
  return null;
}

/** Read a `{ mcpServers: {...} }` JSON file (Claude, Cursor) into servers. */
export async function importFromJsonFile(path: string): Promise<McpServer[]> {
  const data = await readJson(path);
  const table = (data.mcpServers ?? {}) as Record<string, unknown>;
  const out: McpServer[] = [];
  for (const [name, raw] of Object.entries(table)) {
    const server = toServerFromJson(name, (raw ?? {}) as RawJsonServer);
    if (server) out.push(server);
  }
  return out;
}

/** Read OpenCode's `{ mcp: {...} }` config into servers. */
export async function importFromOpencodeFile(path: string): Promise<McpServer[]> {
  const data = await readJson(path);
  const table = (data.mcp ?? {}) as Record<string, unknown>;
  const out: McpServer[] = [];
  for (const [name, rawValue] of Object.entries(table)) {
    const raw = (rawValue ?? {}) as Record<string, unknown>;
    try {
      if (raw.type === "local" && Array.isArray(raw.command) && raw.command.length > 0) {
        const [command, ...args] = (raw.command as unknown[]).filter(
          (a): a is string => typeof a === "string",
        );
        if (!command) continue;
        out.push(
          McpServerSchema.parse({
            name,
            transport: "stdio",
            command,
            args,
            env:
              raw.environment && typeof raw.environment === "object"
                ? Object.fromEntries(
                    Object.entries(raw.environment as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
                  )
                : {},
          }),
        );
      } else if ((raw.type === "remote" || typeof raw.url === "string") && typeof raw.url === "string") {
        out.push(
          McpServerSchema.parse({
            name,
            transport: "http",
            url: raw.url,
            headers:
              raw.headers && typeof raw.headers === "object"
                ? Object.fromEntries(
                    Object.entries(raw.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
                  )
                : {},
          }),
        );
      }
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Import servers already configured in installed agents.
 * `only` limits to e.g. ["claude","cursor","opencode","codex"].
 */
export async function importFromAgents(only?: string[]): Promise<{ agent: string; servers: McpServer[] }[]> {
  const want = (id: string): boolean => !only || only.includes(id);
  const out: { agent: string; servers: McpServer[] }[] = [];
  if (want("claude") && existsSync(claudeJsonPath())) {
    out.push({ agent: "claude", servers: await importFromJsonFile(claudeJsonPath()) });
  }
  if (want("cursor") && existsSync(cursorMcpPath())) {
    out.push({ agent: "cursor", servers: await importFromJsonFile(cursorMcpPath()) });
  }
  if (want("opencode") && existsSync(opencodeConfigPath())) {
    out.push({ agent: "opencode", servers: await importFromOpencodeFile(opencodeConfigPath()) });
  }
  // Codex TOML is append-only managed by soloteam; hand-written Codex servers
  // stay in place and are picked up on next inject — no import needed.
  return out;
}
