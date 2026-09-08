import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

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

function hasCommand(groups: HookGroup[], needle: string): boolean {
  return groups.some((group) => group.hooks.some((hook) => hook.command.includes(needle)));
}

/**
 * Idempotently appends soloteam's pull/push/friction-check hook commands into
 * an existing settings.json, leaving every other key untouched. Safe to run
 * repeatedly — re-running never adds a duplicate entry.
 */
export async function installHooks(settingsPath: string, binCommand: string, dir: string): Promise<string[]> {
  const raw = existsSync(settingsPath) ? await readFile(settingsPath, "utf8") : "{}";
  const settings = JSON.parse(raw) as Settings;
  settings.hooks ??= {};
  settings.hooks.SessionStart ??= [];
  settings.hooks.Stop ??= [];

  const added: string[] = [];
  const pullCmd = `${binCommand} pull --dir "${dir}"`;
  const pushCmd = `${binCommand} push --dir "${dir}"`;
  const frictionCmd = `${binCommand} friction-check --dir "${dir}"`;

  if (!hasCommand(settings.hooks.SessionStart, "soloteam pull")) {
    settings.hooks.SessionStart.push({ matcher: "", hooks: [{ type: "command", command: pullCmd }] });
    added.push("SessionStart: pull");
  }

  if (!hasCommand(settings.hooks.Stop, "soloteam push") && !hasCommand(settings.hooks.Stop, "soloteam friction-check")) {
    settings.hooks.Stop.push({
      matcher: "",
      hooks: [
        { type: "command", command: pushCmd },
        { type: "command", command: frictionCmd },
      ],
    });
    added.push("Stop: push + friction-check");
  }

  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return added;
}
