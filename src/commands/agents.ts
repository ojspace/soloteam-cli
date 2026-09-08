import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { detectAgents, selectAgents } from "../agents";
import { loadConfig } from "../config";
import { resolveRoot } from "../paths";

/** List known agents, installation state, and which ones pull fans out to. */
export async function cmdAgents(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const showAll = Boolean(args.flags.all);

  let configured: string[] = [];
  try {
    configured = (await loadConfig(root)).agents;
  } catch {
    // not initialized yet — fall back to pure auto-detect
  }

  const detected = detectAgents();
  const targets = new Set(selectAgents(configured, root).map((agent) => agent.id));

  console.log(`sync root: ${root}`);
  if (configured.length > 0) console.log(`configured agents: ${configured.join(", ")}`);
  for (const agent of detected) {
    if (!showAll && !agent.installed && !targets.has(agent.id)) continue;
    const state = agent.installed ? "installed" : "not installed";
    const target = targets.has(agent.id) ? " ← sync target" : "";
    console.log(`  ${agent.installed ? "[x]" : "[ ]"} ${agent.id} (${agent.displayName}) — ${state}, ${agent.home}${target}`);
  }
  if (!showAll) console.log(`\n(Showing installed + targeted agents. \`soloteam agents --all\` lists all ${detected.length} known agents.)`);
}
