import { hostname } from "node:os";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { loadConfig } from "../config";
import { commitTracked, porcelainStatus, pushBranch } from "../git";
import { isLocalRemote } from "../mcp";
import { resolveRoot } from "../paths";

export async function cmdPush(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const strict = Boolean(args.flags.strict);

  let config;
  try {
    config = await loadConfig(root);
  } catch (err) {
    if (strict) throw err;
    return;
  }

  const dirty = await porcelainStatus(root, config.track);
  if (!dirty) return; // nothing changed — normal, quiet exit

  const message = flagString(args.flags, "message") ?? `sync: config update from ${hostname()}`;
  const committed = await commitTracked(root, config.track, message);
  if (!committed) {
    if (strict) {
      console.error("soloteam push: commit failed (nothing stageable under tracked paths?)");
      process.exitCode = 1;
    }
    return;
  }

  if (isLocalRemote(config.remote)) return; // local-only: commit is the sync

  const pushed = await pushBranch(root, config.branch);
  if (!pushed.ok && strict) {
    console.error("soloteam push: committed locally but push to remote failed");
    process.exitCode = 1;
  }
}
