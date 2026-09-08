import { existsSync } from "node:fs";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { homePath } from "../agents";
import {
  claudeJsonPath,
  codexConfigPath,
  cursorMcpPath,
  injectMcpEverywhere,
  loadMcpServers,
  opencodeConfigPath,
  removeCodexMcp,
  removeJsonMcp,
  removeOpencodeMcp,
} from "../mcp";
import { resolveRoot } from "../paths";

function selectedAgents(args: ParsedArgs): string[] | undefined {
  const raw = flagString(args.flags, "agent");
  return raw ? raw.split(",").map((id) => id.trim().toLowerCase()) : undefined;
}

async function cmdList(root: string): Promise<void> {
  const servers = await loadMcpServers(root);
  if (servers.length === 0) {
    console.log("No MCP servers declared. Add them to mcp.yaml in the sync root, e.g.:");
    console.log('  servers:\n    - name: my-server\n      command: npx\n      args: ["-y", "my-mcp"]');
    return;
  }
  console.log(`Declared MCP servers (${servers.length}):`);
  for (const server of servers) {
    const how = server.transport === "stdio" ? `${server.command} ${(server.args ?? []).join(" ")}`.trim() : server.url;
    console.log(`  - ${server.name} [${server.transport}] ${how ?? ""}`);
  }
  const names = servers.map((server) => server.name);
  console.log("Injection status:");
  console.log(`  claude:   ${claudeJsonPath()}${existsSync(claudeJsonPath()) ? "" : " (missing — created on inject)"}`);
  console.log(`  cursor:   ${cursorMcpPath()}${existsSync(homePath(".cursor")) ? "" : " (Cursor not installed)"}`);
  console.log(`  opencode: ${opencodeConfigPath()}${existsSync(homePath(".config", "opencode")) ? "" : " (OpenCode not installed)"}`);
  console.log(`  codex:    ${codexConfigPath()}${existsSync(homePath(".codex")) ? "" : " (Codex not installed)"}`);
  void names;
}

async function cmdInject(args: ParsedArgs, root: string): Promise<void> {
  const servers = await loadMcpServers(root);
  if (servers.length === 0) {
    console.error("No MCP servers declared in mcp.yaml — nothing to inject.");
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
  const servers = await loadMcpServers(root);
  const names = servers.map((server) => server.name);
  const agents = selectedAgents(args);
  const want = (id: string): boolean => !agents || agents.includes(id);
  let total = 0;
  if (want("claude")) total += await removeJsonMcp(claudeJsonPath(), names);
  if (want("cursor")) total += await removeJsonMcp(cursorMcpPath(), names);
  if (want("opencode")) total += await removeOpencodeMcp(names);
  if (want("codex") && (await removeCodexMcp())) total += names.length;
  console.log(total > 0 ? `Removed ${total} declared MCP server entr(ies).` : "Nothing to remove.");
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
  } else {
    console.error("Usage: soloteam mcp [list|inject|remove] [--dir <path>] [--agent <id>]");
    process.exitCode = 1;
  }
}
