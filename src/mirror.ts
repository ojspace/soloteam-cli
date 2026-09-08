import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Copies every tracked path verbatim into each configured mirror directory.
 * Raw copy only — no per-tool format translation (Claude Code's CLAUDE.md
 * stays CLAUDE.md in the mirror). Useful for e.g. also feeding rules into a
 * second agent's config dir until that agent gets a real adapter.
 */
export async function syncMirrors(root: string, track: string[], mirrors: string[]): Promise<void> {
  for (const mirror of mirrors) {
    for (const entry of track) {
      const source = join(root, entry);
      const dest = join(mirror, entry);
      await mkdir(dirname(dest), { recursive: true });
      await cp(source, dest, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
