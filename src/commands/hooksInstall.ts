import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { installHooks } from "../hooks";
import { resolveRoot } from "../paths";

export async function cmdHooksInstall(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const settingsPath = flagString(args.flags, "settings") ?? `${root}/settings.json`;

  const added = await installHooks(settingsPath, "soloteam", root);
  if (added.length === 0) {
    console.log(`Already installed in ${settingsPath}`);
    return;
  }
  console.log(`Installed into ${settingsPath}:`);
  for (const entry of added) console.log(`  + ${entry}`);
}
