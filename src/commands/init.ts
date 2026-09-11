import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { isLocalRemote } from "../mcp";
import { writeDefaultConfig } from "../config";
import { writeAllowlistGitignore } from "../gitignore";
import { commitTracked, initRepo, isGitRepo, pushBranch, setRemote } from "../git";
import { installHooks } from "../hooks";
import { injectMcpEverywhere, loadMcpServers } from "../mcp";
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

const STARTER_CLAUDE = `# My agent setup (synced by soloteam)

This file fans out to AGENTS.md in every agent I use.
Keep it short: who I am, how I work, what to remember.

- Solo developer. Prefer small diffs, working code, no ceremony.
- Run \`soloteam recall "<keywords>"\` before non-trivial tasks.
- Save surprises with \`soloteam learn "Title" --body "..."\`.
`;

const STARTER_MCP = `# MCP servers — declared once here, injected into every agent on \`soloteam pull\`.
# Add without editing: soloteam mcp add --name context7 --command npx --args "-y,@upstash/context7-mcp"
# Or import what you already use: soloteam mcp import --from claude,cursor,opencode
servers:
  # - name: context7
  #   command: npx
  #   args: ["-y", "@upstash/context7-mcp"]
  # - name: my-api
  #   transport: http
  #   url: https://example.com/mcp
  #   headers:
  #     Authorization: Bearer \${MY_TOKEN}
`;

const STARTER_RECALL = `# Recall shared knowledge before tasks

Your synced knowledge (learnings, rules, context) is searchable locally.
Before starting a non-trivial task, run:

\`\`\`bash
soloteam recall "<keywords from the task>"
\`\`\`

and fold the top hits into your plan.
`;

async function seedStarterFiles(root: string): Promise<string[]> {
  const seeded: string[] = [];
  const claudePath = join(root, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    await writeFile(claudePath, STARTER_CLAUDE, "utf8");
    seeded.push("CLAUDE.md");
  }
  const mcpPath = join(root, "mcp.yaml");
  if (!existsSync(mcpPath)) {
    await writeFile(mcpPath, STARTER_MCP, "utf8");
    seeded.push("mcp.yaml");
  }
  return seeded;
}

export async function cmdInit(args: ParsedArgs): Promise<void> {
  const local = Boolean(args.flags.local);
  let remote = args.positional[0] ?? (local ? "local" : "");

  if (!remote) {
    console.error("Usage:");
    console.error("  soloteam init <git-remote-url>   # sync across machines (private GitHub repo or your VPS)");
    console.error("  soloteam init --local            # this machine only, add a remote later with git");
    console.error("");
    console.error("Examples:");
    console.error("  soloteam init git@github.com:you/claude-config.git");
    console.error("  soloteam init --local");
    process.exitCode = 1;
    return;
  }
  if (local) remote = "local";

  const root = resolveRoot(flagString(args.flags, "dir"));
  const trackFlag = flagString(args.flags, "track");
  const track = trackFlag ? trackFlag.split(",").map((entry) => entry.trim()) : DEFAULT_TRACK;

  await mkdir(root, { recursive: true });
  const config = await writeDefaultConfig(root, remote, track);
  await writeAllowlistGitignore(root, config.track);
  const seeded = await seedStarterFiles(root);

  if (!isGitRepo(root)) {
    await initRepo(root, config.branch);
  }
  if (!isLocalRemote(config.remote)) {
    await setRemote(root, config.remote);
  }

  // Recall guidance on by default for new inits (remove with `recall disable`).
  const recallPath = join(root, "rules", "soloteam-recall.md");
  if (!existsSync(recallPath)) {
    await mkdir(join(root, "rules"), { recursive: true });
    await writeFile(recallPath, STARTER_RECALL, "utf8");
  }

  const committed = await commitTracked(
    root,
    [...config.track, "soloteam.yaml", ".gitignore"],
    "chore: init soloteam sync",
  );

  let pushNote = "local-only (no remote — add one later, then `soloteam push`)";
  if (!isLocalRemote(config.remote)) {
    const push = await pushBranch(root, config.branch, true);
    pushNote = push.ok ? "pushed" : "push skipped/failed (check `soloteam doctor`)";
  }

  // Lifecycle hooks straight away — init should leave the machine working.
  const settingsPath = join(root, "settings.json");
  const added = await installHooks(settingsPath, "soloteam", root);

  // If agents are already installed, inject any declared MCP now.
  const servers = await loadMcpServers(root);
  if (servers.length > 0) await injectMcpEverywhere(servers);

  console.log(`Initialized ${root}`);
  console.log(`  remote: ${config.remote}`);
  console.log(`  tracking: ${config.track.join(", ")}`);
  if (seeded.length > 0) console.log(`  seeded: ${seeded.join(", ")} (edit, then \`soloteam push\`)`);
  console.log(`  ${committed ? "committed" : "nothing to commit"}, ${pushNote}`);
  console.log(`  hooks: ${added.length > 0 ? added.join("; ") : `already present in ${settingsPath}`}`);
  console.log("");
  console.log("Next:");
  console.log("  soloteam doctor              # verify wiring");
  console.log("  soloteam mcp list            # add your first MCP server");
  console.log('  soloteam learn "First note" --body "what this setup should remember"');
}
