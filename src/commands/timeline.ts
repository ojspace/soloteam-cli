import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { resolveRoot } from "../paths";
import { buildTimeline, formatTimeline } from "../timeline";

/**
 * Chronological view of recent memory — learnings + sessions, newest first.
 * Local files only (the claude-mem-style timeline, without the daemon).
 *
 *   soloteam timeline [--limit N]
 */
export async function cmdTimeline(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const limitRaw = flagString(args.flags, "limit") ?? flagString(args.flags, "n");
  const limit = Math.min(Math.max(Number(limitRaw ?? 20) || 20, 1), 50);
  const entries = await buildTimeline(root, limit);
  console.log(formatTimeline(entries));
}
