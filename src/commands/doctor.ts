import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { selectAgents } from "../agents";
import { loadConfig } from "../config";
import { isGitRepo, remoteReachable } from "../git";
import { loadMcpServers } from "../mcp";
import { opencodePluginInstalled, opencodePluginPath } from "../opencode";
import { configPath, resolveRoot } from "../paths";
import { recallEnabled } from "../recall";
import { loadDeclaredHooks } from "../teamhooks";
import { DEFAULT_TRACK } from "./init";

interface Check {
  label: string;
  pass: boolean;
  detail?: string;
}

export async function cmdDoctor(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const settingsPath = flagString(args.flags, "settings") ?? `${root}/settings.json`;
  const checks: Check[] = [];

  checks.push({ label: "config file exists", pass: existsSync(configPath(root)) });
  checks.push({ label: "root is a git repo", pass: isGitRepo(root) });

  try {
    const config = await loadConfig(root);
    checks.push({ label: "config valid", pass: true });
    const reachable = await remoteReachable(root);
    checks.push({ label: "remote reachable", pass: reachable, detail: config.remote });

    const missing = DEFAULT_TRACK.filter((entry) => !config.track.includes(entry));
    checks.push({
      label: "recommended paths tracked",
      pass: true,
      detail: missing.length === 0 ? "all" : `missing: ${missing.join(", ")}`,
    });

    const targets = selectAgents(config.agents, root);
    checks.push({
      label: "agent targets",
      pass: true,
      detail: targets.length > 0 ? targets.map((agent) => agent.id).join(", ") : "none installed",
    });

    try {
      const hooks = await loadDeclaredHooks(root);
      checks.push({ label: "hooks/hooks.yaml valid", pass: true, detail: `${hooks.length} declared` });
    } catch (err) {
      checks.push({ label: "hooks/hooks.yaml valid", pass: false, detail: (err as Error).message });
    }

    try {
      const servers = await loadMcpServers(root);
      checks.push({ label: "mcp.yaml valid", pass: true, detail: `${servers.length} server(s)` });
    } catch (err) {
      checks.push({ label: "mcp.yaml valid", pass: false, detail: (err as Error).message });
    }

    checks.push({
      label: "recall guidance",
      pass: true,
      detail: recallEnabled(root) ? "enabled" : "disabled (`soloteam recall enable`)",
    });
  } catch (err) {
    checks.push({ label: "config valid", pass: false, detail: (err as Error).message });
  }

  if (existsSync(settingsPath)) {
    const raw = await readFile(settingsPath, "utf8");
    const installed = raw.includes("soloteam pull") && raw.includes("soloteam push");
    checks.push({ label: "claude hooks installed", pass: installed, detail: settingsPath });
  } else {
    checks.push({ label: "claude hooks installed", pass: false, detail: `${settingsPath} not found` });
  }
  checks.push({
    label: "opencode plugin",
    pass: true,
    detail: opencodePluginInstalled() ? opencodePluginPath() : "not installed",
  });

  let allPass = true;
  for (const check of checks) {
    allPass &&= check.pass;
    const mark = check.pass ? "OK  " : "FAIL";
    console.log(`[${mark}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  if (!allPass) process.exitCode = 1;
}
