import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Writes an allowlist .gitignore: everything is ignored by default, then the
 * tracked paths (and soloteam.yaml itself) are explicitly un-ignored. This
 * keeps session history, caches, and auth files out of the synced repo even
 * as the root directory accumulates unrelated local state over time.
 */
export async function writeAllowlistGitignore(root: string, track: string[]): Promise<void> {
  const lines = ["/*", "!/.gitignore", "!/soloteam.yaml"];
  for (const entry of track) {
    const normalized = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    lines.push(`!/${normalized}`);
  }
  await writeFile(join(root, ".gitignore"), `${lines.join("\n")}\n`, "utf8");
}
