import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { loadConfig } from "../config";
import { currentHead, diffNames, fetch, ffMerge, porcelainStatus } from "../git";
import { syncMirrors } from "../mirror";
import { resolveRoot } from "../paths";

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
  if (before !== after) {
    const changed = await diffNames(root, before, after);
    await syncMirrors(root, config.track, config.mirrors);
    console.log(`[soloteam] synced: ${changed.join(", ")}`);
  }
}
