import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { loadConfig, saveConfig } from "../config";
import { resolveRoot } from "../paths";

/** Manage fan-out exclusion prefixes: paths that stay local-only. */
export async function cmdExclude(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const config = await loadConfig(root);
  const sub = args.positional[0];

  if (sub === "list" || sub === undefined) {
    if (config.exclude.length === 0) {
      console.log("No exclusions — every synced path fans out to all target agents.");
    } else {
      console.log("Excluded from fan-out:");
      for (const pattern of config.exclude) console.log(`  - ${pattern}`);
    }
    return;
  }

  const pattern = args.positional[1]?.replace(/\/$/, "");
  if ((sub === "add" || sub === "remove") && pattern) {
    if (sub === "add") {
      if (!config.exclude.includes(pattern)) config.exclude.push(pattern);
      console.log(`Excluded ${pattern} from fan-out.`);
    } else {
      config.exclude = config.exclude.filter((entry) => entry !== pattern);
      console.log(`Unexcluded ${pattern}.`);
    }
    await saveConfig(root, config);
    return;
  }

  console.error("Usage: soloteam exclude [list|add <path>|remove <path>]");
  process.exitCode = 1;
}
