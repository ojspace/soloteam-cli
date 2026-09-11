import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { resolveRoot } from "../paths";
import { importFromClaudeMem, importMarkdownDir } from "../timeline";

/**
 * Bring outside notes into soloteam's local memory.
 *
 *   soloteam memory import --from-claude-mem [--dir <path>]
 *   soloteam memory import --from <directory>
 */
export async function cmdMemory(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const sub = args.positional[0]?.toLowerCase();
  if (sub !== "import") {
    console.error("Usage: soloteam memory import (--from-claude-mem | --from <directory>)");
    process.exitCode = 1;
    return;
  }

  const fromDir = flagString(args.flags, "from");
  const fromClaudeMem = Boolean(args.flags["from-claude-mem"] ?? args.flags.fromClaudeMem);

  if (fromDir && !fromClaudeMem) {
    const created = await importMarkdownDir(root, fromDir);
    if (created.length === 0) {
      console.log(`Nothing importable found under ${fromDir} (looked for *.md with content).`);
      return;
    }
    console.log(`Imported ${created.length} note(s) into learnings/:`);
    for (const rel of created.slice(0, 20)) console.log(`  + ${rel}`);
    console.log("Run `soloteam push` to sync, `soloteam recall \"<topic>\"` to search.");
    return;
  }

  if (fromClaudeMem || !fromDir) {
    const { from, created } = await importFromClaudeMem(root, fromDir);
    if (created.length === 0) {
      console.log("No claude-mem notes found to import.");
      console.log("Tip: soloteam memory import --from ~/my-notes   # any folder of markdown");
      return;
    }
    console.log(`Imported ${created.length} note(s) from ${from} into learnings/:`);
    for (const rel of created.slice(0, 20)) console.log(`  + ${rel}`);
    console.log("Run `soloteam push` to sync, `soloteam recall \"<topic>\"` to search.");
    return;
  }
}
