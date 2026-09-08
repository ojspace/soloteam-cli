import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { loadConfig } from "../config";
import { isGitRepo, remoteReachable } from "../git";
import { configPath, resolveRoot } from "../paths";

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
  } catch (err) {
    checks.push({ label: "config valid", pass: false, detail: (err as Error).message });
  }

  if (existsSync(settingsPath)) {
    const raw = await readFile(settingsPath, "utf8");
    const installed = raw.includes("soloteam pull") && raw.includes("soloteam push");
    checks.push({ label: "hooks installed", pass: installed, detail: settingsPath });
  } else {
    checks.push({ label: "hooks installed", pass: false, detail: `${settingsPath} not found` });
  }

  let allPass = true;
  for (const check of checks) {
    allPass &&= check.pass;
    const mark = check.pass ? "OK  " : "FAIL";
    console.log(`[${mark}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  if (!allPass) process.exitCode = 1;
}
