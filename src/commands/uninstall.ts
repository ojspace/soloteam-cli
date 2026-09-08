import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { removeManagedHooks } from "../hooks";
import { removeOpencodePlugin } from "../opencode";
import { resolveRoot, stateDir } from "../paths";

/**
 * Remove everything soloteam injected on this machine: lifecycle hooks from
 * Claude settings, the OpenCode plugin, and local hook state. Your synced
 * content (rules, learnings, sessions) and the git repo are left untouched —
 * add --purge to also delete soloteam.yaml and local state.
 */
export async function cmdUninstall(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const settingsPath = flagString(args.flags, "settings") ?? join(root, "settings.json");
  const purge = Boolean(args.flags.purge);

  const removedHooks = await removeManagedHooks(settingsPath);
  console.log(removedHooks > 0 ? `Removed ${removedHooks} hook(s) from ${settingsPath}` : `No managed hooks in ${settingsPath}`);
  console.log((await removeOpencodePlugin()) ? "Removed OpenCode plugin" : "OpenCode plugin: not installed");

  const state = stateDir(root);
  if (existsSync(state)) {
    await rm(state, { recursive: true, force: true });
    console.log(`Removed state dir ${state}`);
  }

  if (purge) {
    for (const name of ["soloteam.yaml"]) {
      const full = join(root, name);
      if (existsSync(full)) {
        await rm(full);
        console.log(`Removed ${full}`);
      }
    }
    console.log("Purge complete. Re-run `soloteam init <remote>` to start over.");
  } else {
    console.log("Uninstalled. Config + synced content kept (re-run `soloteam hooks install` to re-enable).");
  }
}
