import { readFile } from "node:fs/promises";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { resolveRoot } from "../paths";
import { saveLearning } from "../recall";
import { readStdin } from "../runtime";

/**
 * Save a learning note to learnings/ (synced, searchable via recall).
 *
 *   soloteam learn "Title" --body "what happened and what to remember"
 *   echo "..." | soloteam learn "Title"
 *   soloteam learn "Title" --file ./note.md
 */
export async function cmdLearn(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const title = args.positional.join(" ").trim();
  if (!title) {
    console.error('Usage: soloteam learn "Title" [--body <text> | --file <path>]');
    process.exitCode = 1;
    return;
  }

  let body = flagString(args.flags, "body") ?? "";
  const file = flagString(args.flags, "file");
  if (file) {
    body = await readFile(file, "utf8");
  } else if (!body) {
    body = (await readStdin()).trim();
  }
  if (!body) {
    console.error("Nothing to save: pass --body, --file, or pipe the note on stdin.");
    process.exitCode = 1;
    return;
  }

  const rel = await saveLearning(root, title, body);
  console.log(`Saved ${rel} — run \`soloteam push\` to sync it to your other machines.`);
}
