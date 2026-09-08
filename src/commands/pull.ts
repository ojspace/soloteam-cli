import { join } from "node:path";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { homePath, selectAgents } from "../agents";
import { loadConfig } from "../config";
import { fanoutToAgents } from "../fanout";
import { currentHead, diffNames, fetch, ffMerge, porcelainStatus } from "../git";
import { installHooks } from "../hooks";
import { injectMcpEverywhere, loadMcpServers } from "../mcp";
import { syncMirrors } from "../mirror";
import { injectOpencodePlugin, opencodePluginInstalled } from "../opencode";
import { resolveRoot } from "../paths";
import { loadDeclaredHooks } from "../teamhooks";
import { existsSync } from "node:fs";

export async function cmdPull(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const strict = Boolean(args.flags.strict);

  let config;
  try {
    config = await loadConfig(root);
  } catch (err) {
    if (strict) throw err;
    return; // silent no-op: safe to wire into a hook before init has run
  }

  const dirty = await porcelainStatus(root, config.track);
  if (dirty) {
    if (strict) {
      console.error("soloteam pull: local edits present, run `soloteam push` first");
      process.exitCode = 1;
    }
    return;
  }

  const before = await currentHead(root);
  const fetched = await fetch(root, config.branch);
  if (!fetched.ok) {
    if (strict) {
      console.error("soloteam pull: could not reach remote");
      process.exitCode = 1;
    }
    return;
  }

  const merged = await ffMerge(root, config.branch);
  if (!merged.ok) {
    if (strict) {
      console.error("soloteam pull: fast-forward merge failed (local history diverged?)");
      process.exitCode = 1;
    }
    return;
  }

  const after = await currentHead(root);
  const changed = before !== after ? await diffNames(root, before, after) : [];

  // Deliver everything downstream: mirrors, per-agent fan-out, hooks, MCP.
  await syncMirrors(root, config.track, config.mirrors);

  const targets = selectAgents(config.agents, root);
  const fanout = await fanoutToAgents(root, targets, config.exclude);

  const declared = await loadDeclaredHooks(root);
  const settingsPath = join(root, "settings.json");
  if (existsSync(settingsPath) || root === homePath(".claude")) {
    await installHooks(settingsPath, "soloteam", root, declared, "claude");
  }
  if (opencodePluginInstalled() || existsSync(homePath(".config", "opencode"))) {
    await injectOpencodePlugin("soloteam", root);
  }
  await injectMcpEverywhere(await loadMcpServers(root));

  const syncedAgents = fanout.filter((result) => result.copied.length > 0);
  if (changed.length > 0 || syncedAgents.length > 0) {
    const files = changed.length > 0 ? changed.join(", ") : "no file changes";
    const agents = syncedAgents.map((result) => `${result.agent} (${result.copied.length})`).join(", ");
    console.log(`[soloteam] synced: ${files}${agents ? ` → ${agents}` : ""}`);
  }
}
