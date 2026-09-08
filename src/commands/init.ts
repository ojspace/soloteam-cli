import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { writeDefaultConfig } from "../config";
import { writeAllowlistGitignore } from "../gitignore";
import { commitTracked, initRepo, isGitRepo, pushBranch, setRemote } from "../git";
import { installHooks } from "../hooks";
import { resolveRoot } from "../paths";

export const DEFAULT_TRACK = [
  "CLAUDE.md",
  "rules/",
  "context/",
  "commands/",
  "skills/",
  "agents/",
  "hooks/",
  "learnings/",
  "sessions/",
  "mcp.yaml",
];

export async function cmdInit(args: ParsedArgs): Promise<void> {
  const remote = args.positional[0];
  if (!remote) {
    console.error("Usage: soloteam init <git-remote-url> [--dir <path>] [--track a,b,c]");
    process.exitCode = 1;
    return;
  }

  const root = resolveRoot(flagString(args.flags, "dir"));
  const trackFlag = flagString(args.flags, "track");
  const track = trackFlag ? trackFlag.split(",").map((entry) => entry.trim()) : DEFAULT_TRACK;

  await mkdir(root, { recursive: true });
  const config = await writeDefaultConfig(root, remote, track);
  await writeAllowlistGitignore(root, config.track);

  if (!isGitRepo(root)) {
    await initRepo(root, config.branch);
  }
  await setRemote(root, config.remote);

  const committed = await commitTracked(
    root,
    [...config.track, "soloteam.yaml", ".gitignore"],
    "chore: init soloteam sync",
  );
  const push = await pushBranch(root, config.branch, true);

  // Lifecycle hooks straight away — init should leave the machine working.
  const settingsPath = join(root, "settings.json");
  const added = await installHooks(settingsPath, "soloteam", root);

  console.log(`Initialized ${root}`);
  console.log(`  remote: ${config.remote}`);
  console.log(`  tracking: ${config.track.join(", ")}`);
  console.log(`  ${committed ? "committed" : "nothing to commit"}, ${push.ok ? "pushed" : "push skipped/failed"}`);
  console.log(`  hooks: ${added.length > 0 ? added.join("; ") : `already present in ${settingsPath}`}`);
}
