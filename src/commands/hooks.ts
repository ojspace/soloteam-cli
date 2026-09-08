import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { homePath } from "../agents";
import { installHooks, listManagedHooks, removeManagedHooks } from "../hooks";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { injectOpencodePlugin, opencodePluginInstalled, opencodePluginPath, removeOpencodePlugin } from "../opencode";
import { resolveRoot } from "../paths";
import { loadDeclaredHooks } from "../teamhooks";

function claudeSettingsPath(root: string, override?: string): string {
  return override ?? join(root, "settings.json");
}

async function cmdInstall(args: ParsedArgs, root: string): Promise<void> {
  const settingsPath = claudeSettingsPath(root, flagString(args.flags, "settings"));
  const declared = await loadDeclaredHooks(root);
  const added = await installHooks(settingsPath, "soloteam", root, declared, "claude");
  if (added.length === 0) {
    console.log(`Claude hooks already installed in ${settingsPath}`);
  } else {
    console.log(`Installed into ${settingsPath}:`);
    for (const entry of added) console.log(`  + ${entry}`);
  }
  if (declared.length > 0) console.log(`  (evaluated ${declared.length} declarative hook(s) from hooks/hooks.yaml)`);

  // OpenCode bridge — only when OpenCode is actually in use on this machine.
  if (requireOpencode(args) && opencodeWanted(root)) {
    const path = await injectOpencodePlugin("soloteam", root);
    console.log(`OpenCode plugin: ${path}`);
  }
}

function requireOpencode(args: ParsedArgs): boolean {
  const only = flagString(args.flags, "agent");
  return !only || only.split(",").map((id) => id.trim().toLowerCase()).includes("opencode");
}

function opencodeWanted(root: string): boolean {
  void root;
  return opencodePluginInstalled() || existsSync(homePath(".config", "opencode"));
}

async function cmdList(args: ParsedArgs, root: string): Promise<void> {
  const settingsPath = claudeSettingsPath(root, flagString(args.flags, "settings"));
  const managed = await listManagedHooks(settingsPath);
  console.log(`Claude Code (${settingsPath}):`);
  if (managed.length === 0) console.log("  (no soloteam-managed hooks)");
  for (const entry of managed) console.log(`  - ${entry}`);

  console.log("OpenCode plugin:");
  console.log(opencodePluginInstalled() ? `  - ${opencodePluginPath()}` : "  (not installed)");

  const declared = await loadDeclaredHooks(root);
  console.log(`Declarative (hooks/hooks.yaml, ${declared.length}):`);
  for (const hook of declared) {
    const tools = hook.tools.length > 0 ? hook.tools.join(",") : "all";
    console.log(`  - ${hook.id} [${hook.event}] tools=${tools} :: ${hook.command}`);
  }
}

async function cmdRemove(args: ParsedArgs, root: string): Promise<void> {
  const settingsPath = claudeSettingsPath(root, flagString(args.flags, "settings"));
  const removed = await removeManagedHooks(settingsPath);
  console.log(removed > 0 ? `Removed ${removed} managed hook(s) from ${settingsPath}` : `Nothing to remove in ${settingsPath}`);
  if (requireOpencode(args)) {
    const deleted = await removeOpencodePlugin();
    console.log(deleted ? `Removed OpenCode plugin ${opencodePluginPath()}` : "OpenCode plugin: not installed");
  }
}

export async function cmdHooks(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const sub = args.positional[0];
  if (sub === "install" || sub === undefined) {
    await cmdInstall(args, root);
  } else if (sub === "list") {
    await cmdList(args, root);
  } else if (sub === "remove") {
    await cmdRemove(args, root);
  } else {
    console.error("Usage: soloteam hooks [install|list|remove] [--dir <path>] [--settings <path>] [--agent <id>]");
    process.exitCode = 1;
  }
}
