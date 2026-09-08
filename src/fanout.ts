import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { ResolvedAgent } from "./agents";

/**
 * Content fan-out: copy the synced knowledge into each target agent's native
 * layout after a successful pull.
 *
 * - `CLAUDE.md` → the agent's memory file (`AGENTS.md` everywhere except
 *   Claude Code itself, which keeps `CLAUDE.md`). Every major agent reads
 *   `AGENTS.md` at its home dir, so one memory file serves all of them.
 * - `skills/` → the agent's skills dir (the `~/.<id>/skills` convention).
 * - `rules/`, `commands/`, `context/` → same-named dirs (best effort;
 *   agents that use a different layout still get readable markdown).
 */

const DIR_MAPPINGS = ["skills", "rules", "commands", "context"] as const;

function excluded(rel: string, exclude: string[]): boolean {
  const normalized = rel.replace(/\/$/, "");
  return exclude.some((pattern) => {
    const p = pattern.replace(/\/$/, "");
    return normalized === p || normalized.startsWith(`${p}/`);
  });
}

async function copyInto(root: string, rel: string, dest: string): Promise<boolean> {
  const source = join(root, rel);
  if (!existsSync(source)) return false;
  await mkdir(dirname(dest), { recursive: true });
  try {
    await cp(source, dest, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export interface FanoutResult {
  agent: string;
  copied: string[];
  skipped: string[];
}

/** Fan out synced content from `root` into each agent home. */
export async function fanoutToAgents(
  root: string,
  agents: ResolvedAgent[],
  exclude: string[],
): Promise<FanoutResult[]> {
  const results: FanoutResult[] = [];

  for (const agent of agents) {
    const copied: string[] = [];
    const skipped: string[] = [];

    // Memory file: CLAUDE.md at the root becomes AGENTS.md (or CLAUDE.md).
    if (!excluded("CLAUDE.md", exclude)) {
      const destName = agent.id === "claude" ? "CLAUDE.md" : agent.memoryFile;
      const ok = await copyInto(root, "CLAUDE.md", join(agent.home, destName));
      (ok ? copied : skipped).push(`CLAUDE.md → ${destName}`);
    } else {
      skipped.push("CLAUDE.md (excluded)");
    }

    for (const dir of DIR_MAPPINGS) {
      const rel = `${dir}/`;
      if (excluded(rel, exclude)) {
        skipped.push(`${dir}/ (excluded)`);
        continue;
      }
      const destSub = dir === "skills" ? relativePath(agent.skillsDir, agent.homeDir) : dir;
      const ok = await copyInto(root, dir, join(agent.home, destSub));
      (ok ? copied : skipped).push(ok ? `${dir}/` : `${dir}/ (absent in root)`);
    }

    results.push({ agent: agent.id, copied, skipped });
  }

  return results;
}

/** Skills dir relative to the agent home (usually just "skills"). */
function relativePath(skillsDir: string, homeDir: string): string {
  const rel = relative(homeDir, skillsDir);
  return rel && !rel.startsWith("..") ? rel : "skills";
}
