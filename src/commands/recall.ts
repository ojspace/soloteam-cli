import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { resolveRoot } from "../paths";
import { disableRecall, enableRecall, recallEnabled, searchKnowledge } from "../recall";

async function cmdSearch(args: ParsedArgs, root: string, query: string): Promise<void> {
  const limitRaw = flagString(args.flags, "limit") ?? flagString(args.flags, "n");
  const limit = Math.min(Math.max(Number(limitRaw ?? 5) || 5, 1), 20);
  const hits = await searchKnowledge(root, query, limit);
  if (hits.length === 0) {
    console.log(`No local knowledge matches "${query}".`);
    return;
  }
  for (const [index, hit] of hits.entries()) {
    console.log(`[${index + 1}/${hits.length}] ${hit.title} — ${hit.path} (score ${hit.score.toFixed(1)})`);
    if (hit.excerpt) console.log(`  ${hit.excerpt}`);
  }
}

export async function cmdRecall(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const sub = args.positional[0]?.toLowerCase();

  if (sub === "enable") {
    const rel = await enableRecall(root);
    console.log(`Recall guidance installed at ${rel} — push to sync it, agents will search before tasks.`);
    return;
  }
  if (sub === "disable") {
    const removed = await disableRecall(root);
    console.log(removed ? "Recall guidance removed." : "Recall guidance was not installed.");
    return;
  }
  if (sub === "status") {
    console.log(recallEnabled(root) ? "recall guidance: enabled (rules/soloteam-recall.md present)" : "recall guidance: disabled");
    return;
  }

  const query = args.positional.join(" ").trim();
  if (!query) {
    console.error("Usage: soloteam recall <query> [--limit N] | soloteam recall [enable|disable|status]");
    process.exitCode = 1;
    return;
  }
  await cmdSearch(args, root, query);
}
