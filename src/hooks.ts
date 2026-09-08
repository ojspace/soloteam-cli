import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DeclaredHook } from "./teamhooks";
import { hookAppliesTo } from "./teamhooks";

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

interface Settings {
  hooks?: {
    Stop?: HookGroup[];
    SessionStart?: HookGroup[];
    [event: string]: HookGroup[] | undefined;
  };
  [key: string]: unknown;
}

/** Substring present in every hook command soloteam manages. */
export const MANAGED_NEEDLE = "soloteam";

function hasCommand(groups: HookGroup[], needle: string): boolean {
  return groups.some((group) => group.hooks.some((hook) => hook.command.includes(needle)));
}

function appendCommand(groups: HookGroup[], matcher: string, command: string): boolean {
  if (hasCommand(groups, command)) return false;
  const group = groups.find((candidate) => (candidate.matcher ?? "") === matcher);
  if (group) {
    group.hooks.push({ type: "command", command });
  } else {
    groups.push({ matcher, hooks: [{ type: "command", command }] });
  }
  return true;
}

async function readSettings(settingsPath: string): Promise<Settings> {
  const raw = existsSync(settingsPath) ? await readFile(settingsPath, "utf8") : "{}";
  return JSON.parse(raw) as Settings;
}

async function writeSettings(settingsPath: string, settings: Settings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

/**
 * Idempotently install soloteam's lifecycle hooks (pull on SessionStart,
 * push + friction-check on Stop) plus any declarative hooks from
 * hooks/hooks.yaml that apply to this agent.
 */
export async function installHooks(
  settingsPath: string,
  binCommand: string,
  dir: string,
  declared: DeclaredHook[] = [],
  agentId = "claude",
): Promise<string[]> {
  const settings = await readSettings(settingsPath);
  settings.hooks ??= {};
  settings.hooks.SessionStart ??= [];
  settings.hooks.Stop ??= [];

  const added: string[] = [];
  const pullCmd = `${binCommand} pull --dir "${dir}"`;
  const pushCmd = `${binCommand} push --dir "${dir}"`;
  const frictionCmd = `${binCommand} friction-check --dir "${dir}"`;

  if (appendCommand(settings.hooks.SessionStart, "", pullCmd)) {
    added.push("SessionStart: pull");
  }

  const stopGroup: HookGroup[] = settings.hooks.Stop;
  let stopAdded = false;
  if (appendCommand(stopGroup, "", pushCmd)) stopAdded = true;
  if (appendCommand(stopGroup, "", frictionCmd)) stopAdded = true;
  if (stopAdded) added.push("Stop: push + friction-check");

  for (const hook of declared) {
    if (!hookAppliesTo(hook, agentId)) continue;
    settings.hooks[hook.event] ??= [];
    const groups = settings.hooks[hook.event] as HookGroup[];
    if (appendCommand(groups, hook.matcher ?? "", hook.command)) {
      added.push(`${hook.event}: ${hook.id}`);
    }
  }

  await writeSettings(settingsPath, settings);
  return added;
}

/**
 * Remove every soloteam-managed hook command from a settings file
 * (lifecycle + declarative). Returns the number of entries removed.
 */
export async function removeManagedHooks(settingsPath: string): Promise<number> {
  if (!existsSync(settingsPath)) return 0;
  const settings = await readSettings(settingsPath);
  if (!settings.hooks) return 0;

  let removed = 0;
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept: HookGroup[] = [];
    for (const group of groups) {
      const remaining = group.hooks.filter((hook) => {
        const managed = hook.command.includes(MANAGED_NEEDLE);
        if (managed) removed++;
        return !managed;
      });
      if (remaining.length > 0) kept.push({ ...group, hooks: remaining });
    }
    if (kept.length > 0) {
      settings.hooks[event] = kept;
    } else {
      delete settings.hooks[event];
    }
  }

  await writeSettings(settingsPath, settings);
  return removed;
}

/** Human-readable list of soloteam-managed hook commands in a settings file. */
export async function listManagedHooks(settingsPath: string): Promise<string[]> {
  if (!existsSync(settingsPath)) return [];
  const settings = await readSettings(settingsPath);
  if (!settings.hooks) return [];
  const out: string[] = [];
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      for (const hook of group.hooks) {
        if (hook.command.includes(MANAGED_NEEDLE)) {
          const matcher = group.matcher ? ` (matcher: ${group.matcher})` : "";
          out.push(`${event}: ${hook.command}${matcher}`);
        }
      }
    }
  }
  return out;
}
