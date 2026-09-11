import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { selectAgents } from "../agents";
import { loadConfig } from "../config";
import { aheadBehind, porcelainStatus } from "../git";
import { isLocalRemote } from "../mcp";
import { resolveRoot } from "../paths";

export async function cmdStatus(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const config = await loadConfig(root);

  const dirty = await porcelainStatus(root, config.track);
  const localOnly = isLocalRemote(config.remote);
  const counts = localOnly ? null : await aheadBehind(root, config.branch);
  const targets = selectAgents(config.agents, root, (warning) => console.log(`warning: ${warning}`));

  console.log(`root: ${root}`);
  console.log(`remote: ${config.remote}${localOnly ? " (local-only — set a git URL in soloteam.yaml to sync machines)" : ""}`);
  console.log(`tracking: ${config.track.join(", ")}`);
  console.log(`agents: ${targets.length > 0 ? targets.map((agent) => agent.id).join(", ") : "(none installed)"}`);
  if (config.exclude.length > 0) console.log(`excluded: ${config.exclude.join(", ")}`);
  console.log(dirty ? `local changes:\n${dirty}` : "local: clean");
  if (localOnly) {
    console.log("sync: local-only (no remote to compare)");
  } else {
    console.log(counts ? `ahead ${counts.ahead}, behind ${counts.behind} (vs origin/${config.branch})` : "ahead/behind: unknown (fetch first)");
  }
}
