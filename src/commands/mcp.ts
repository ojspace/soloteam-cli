import { existsSync } from "node:fs";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { homePath } from "../agents";
import {
  claudeJsonPath,
  codexConfigPath,
  cursorMcpPath,
  importFromAgents,
  injectMcpEverywhere,
  loadMcpServers,
  opencodeConfigPath,
  parseMcpServer,
  removeCodexMcp,
  removeJsonMcp,
  removeMcpServerFromFile,
  removeOpencodeMcp,
  saveMcpServers,
  upsertMcpServer,
} from "../mcp";
import { resolveRoot } from "../paths";

function selectedAgents(args: ParsedArgs): string[] | undefined {
  const raw = flagString(args.flags, "agent") ?? flagString(args.flags, "from");
  return raw ? raw.split(",").map((id) => id.trim().toLowerCase()) : undefined;
}

function parseKeyValues(values: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of values ?? []) {
    for (const part of entry.split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (key) out[key] = value;
    }
  }
  return out;
}

function flagAll(args: ParsedArgs, key: string): string[] {
  const value = args.flags[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

async function cmdList(root: string): Promise<void> {
  const servers = await loadMcpServers(root);
  if (servers.length === 0) {
    console.log("No MCP servers declared yet.");
    console.log("");
    console.log("Add one without editing YAML:");
    console.log('  soloteam mcp add --name context7 --command npx --args "-y,@upstash/context7-mcp"');
    console.log("  soloteam mcp add --name my-api --url https://example.com/mcp --header \"Authorization=Bearer ${MY_TOKEN}\"");
    console.log("");
    console.log("Or pull in what you already use:");
    console.log("  soloteam mcp import --from claude,cursor,opencode");
    return;
  }
  console.log(`MCP servers (${servers.length}) — declared once in mcp.yaml, injected on every pull:`);
  for (const server of servers) {
    const how = server.transport === "stdio" ? `${server.command} ${(server.args ?? []).join(" ")}`.trim() : server.url;
    console.log(`  - ${server.name} [${server.transport}] ${how ?? ""}`);
  }
  console.log("Injection status:");
  console.log(`  claude:   ${claudeJsonPath()}${existsSync(claudeJsonPath()) ? "" : " (missing — created on inject)"}`);
  console.log(`  cursor:   ${cursorMcpPath()}${existsSync(homePath(".cursor")) ? "" : " (Cursor not installed)"}`);
  console.log(`  opencode: ${opencodeConfigPath()}${existsSync(homePath(".config", "opencode")) ? "" : " (OpenCode not installed)"}`);
  console.log(`  codex:    ${codexConfigPath()}${existsSync(homePath(".codex")) ? "" : " (Codex not installed)"}`);
  console.log("");
  console.log("Next: soloteam mcp inject   # write to all installed agents now");
}

async function cmdInject(args: ParsedArgs, root: string): Promise<void> {
  const servers = await loadMcpServers(root);
  if (servers.length === 0) {
    console.error("No MCP servers declared in mcp.yaml — run `soloteam mcp add ...` or `soloteam mcp import ...` first.");
    process.exitCode = 1;
    return;
  }
  const results = await injectMcpEverywhere(servers, selectedAgents(args));
  if (results.length === 0) {
    console.log("No supported agent homes found (looked for Claude, Cursor, OpenCode, Codex).");
    return;
  }
  for (const result of results) {
    console.log(`[${result.agent}] ${result.servers.join(", ")} → ${result.path}`);
  }
}

async function cmdRemove(args: ParsedArgs, root: string): Promise<void> {
  const name = args.positional[1];
  if (name) {
    // Remove one server from the declaration AND from agents.
    const removed = await removeMcpServerFromFile(root, name);
    if (!removed) {
      console.error(`No server named "${name}" in mcp.yaml.`);
      process.exitCode = 1;
      return;
    }
    const agents = selectedAgents(args);
    const want = (id: string): boolean => !agents || agents.includes(id);
    if (want("claude")) await removeJsonMcp(claudeJsonPath(), [name]);
    if (want("cursor")) await removeJsonMcp(cursorMcpPath(), [name]);
    if (want("opencode")) await removeOpencodeMcp([name]);
    // Codex uses a single managed block; rewrite it from the updated file.
    if (want("codex")) {
      const remaining = await loadMcpServers(root);
      const { injectCodexMcp } = await import("../mcp");
      if (remaining.length === 0) await removeCodexMcp();
      else await injectCodexMcp(remaining);
    }
    console.log(`Removed "${name}" from mcp.yaml and installed agents. Run \`soloteam push\` to sync.`);
    return;
  }

  // No name: legacy behavior — strip all declared servers from agents, keep mcp.yaml.
  const servers = await loadMcpServers(root);
  const names = servers.map((server) => server.name);
  const agents = selectedAgents(args);
  const want = (id: string): boolean => !agents || agents.includes(id);
  let total = 0;
  if (want("claude")) total += await removeJsonMcp(claudeJsonPath(), names);
  if (want("cursor")) total += await removeJsonMcp(cursorMcpPath(), names);
  if (want("opencode")) total += await removeOpencodeMcp(names);
  if (want("codex") && (await removeCodexMcp())) total += names.length;
  console.log(total > 0 ? `Removed ${total} declared MCP server entr(ies) from agents.` : "Nothing to remove.");
}

async function cmdAdd(args: ParsedArgs, root: string): Promise<void> {
  const name = flagString(args.flags, "name") ?? args.positional[1];
  if (!name) {
    console.error(
      'Usage: soloteam mcp add --name <id> (--command <bin> [--args "a,b"] [--env KEY=val,...] | --url <https-url> [--header "K=V,..."] [--transport http|sse])',
    );
    process.exitCode = 1;
    return;
  }
  const command = flagString(args.flags, "command");
  const url = flagString(args.flags, "url");
  if (!command && !url) {
    console.error("Pass --command for a local server or --url for a remote server.");
    process.exitCode = 1;
    return;
  }
  const argsRaw = flagString(args.flags, "args");
  const listArgs = argsRaw ? argsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const env = parseKeyValues(flagAll(args, "env"));
  const headers = parseKeyValues(flagAll(args, "header"));
  const transportRaw = (flagString(args.flags, "transport") ?? (url ? "http" : "stdio")).toLowerCase();
  const transport = transportRaw === "sse" ? "sse" : url ? "http" : "stdio";

  try {
    const server = parseMcpServer(
      url
        ? { name, transport, url, headers }
        : { name, transport: "stdio", command, args: listArgs, env },
    );
    const path = await upsertMcpServer(root, server);
    console.log(`Saved "${name}" → ${path}`);
    const results = await injectMcpEverywhere([server]);
    for (const result of results) console.log(`[${result.agent}] ${result.servers.join(", ")} → ${result.path}`);
    console.log("Run `soloteam push` to sync it to your other machines.");
  } catch (err) {
    console.error(`Invalid server: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

async function cmdImport(args: ParsedArgs, root: string): Promise<void> {
  const only = selectedAgents(args);
  const found = await importFromAgents(only);
  const merged = new Map<string, (typeof found)[number]["servers"][number]>();
  for (const group of found) {
    for (const server of group.servers) {
      if (!merged.has(server.name)) merged.set(server.name, server);
    }
  }
  if (merged.size === 0) {
    console.log("Nothing to import — no MCP servers found in installed agent configs.");
    console.log("Tip: soloteam mcp import --from claude,cursor,opencode");
    return;
  }
  const existing = await loadMcpServers(root);
  const existingNames = new Set(existing.map((s) => s.name));
  const fresh = [...merged.values()].filter((s) => !existingNames.has(s.name));
  await saveMcpServers(root, [...existing, ...fresh]);
  console.log(`Imported ${fresh.length} new server(s), ${existing.length} already declared (${merged.size} found):`);
  for (const server of [...merged.values()]) {
    const mark = existingNames.has(server.name) ? "kept" : "added";
    console.log(`  ${mark} ${server.name} [${server.transport}]`);
  }
  console.log("Run `soloteam mcp inject && soloteam push` to fan out + sync.");
}

export async function cmdMcp(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const sub = args.positional[0];
  if (sub === "list" || sub === undefined) {
    await cmdList(root);
  } else if (sub === "inject") {
    await cmdInject(args, root);
  } else if (sub === "remove") {
    await cmdRemove(args, root);
  } else if (sub === "add") {
    await cmdAdd(args, root);
  } else if (sub === "import") {
    await cmdImport(args, root);
  } else {
    console.error("Usage: soloteam mcp [list|add|import|inject|remove [<name>]] [--dir <path>] [--agent <id>]");
    process.exitCode = 1;
  }
}
