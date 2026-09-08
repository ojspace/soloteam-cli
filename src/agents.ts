import { existsSync } from "node:fs";
import { join } from "node:path";
import { userHome } from "./paths";

/**
 * Agent registry: the coding agents soloteam can fan out to.
 *
 * Skills-dir layouts follow the same `~/.<id>/skills` convention teamai-cli
 * documents in its known-agents registry; every agent below also reads
 * `AGENTS.md` at its home dir, which is where the synced CLAUDE.md lands.
 */

export type HookSupport = "claude-settings" | "opencode-plugin" | "none";

export interface AgentAdapter {
  /** Lowercase id used in config + `--agent` flags. */
  id: string;
  displayName: string;
  /** Home dir relative to $HOME, e.g. ".codex". */
  homeDir: string;
  /** Skills dir relative to $HOME. */
  skillsDir: string;
  /** How soloteam injects lifecycle hooks, if at all. */
  hooks: HookSupport;
  /** Basename of the memory file this agent reads at its home dir. */
  memoryFile: string;
}

export const KNOWN_AGENTS: AgentAdapter[] = [
  { id: "claude", displayName: "Claude Code", homeDir: ".claude", skillsDir: ".claude/skills", hooks: "claude-settings", memoryFile: "CLAUDE.md" },
  { id: "codex", displayName: "Codex CLI", homeDir: ".codex", skillsDir: ".codex/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "cursor", displayName: "Cursor", homeDir: ".cursor", skillsDir: ".cursor/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "opencode", displayName: "OpenCode", homeDir: ".config/opencode", skillsDir: ".config/opencode/skills", hooks: "opencode-plugin", memoryFile: "AGENTS.md" },
  { id: "openclaw", displayName: "OpenClaw", homeDir: ".openclaw", skillsDir: ".openclaw/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "gemini", displayName: "Gemini CLI", homeDir: ".gemini", skillsDir: ".gemini/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "copilot", displayName: "Copilot CLI", homeDir: ".copilot", skillsDir: ".copilot/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "aider", displayName: "Aider", homeDir: ".aider", skillsDir: ".aider/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "windsurf", displayName: "Windsurf", homeDir: ".windsurf", skillsDir: ".windsurf/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "kiro", displayName: "Kiro", homeDir: ".kiro", skillsDir: ".kiro/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "qoder", displayName: "Qoder", homeDir: ".qoder", skillsDir: ".qoder/skills", hooks: "none", memoryFile: "AGENTS.md" },
  { id: "codebuddy", displayName: "CodeBuddy", homeDir: ".codebuddy", skillsDir: ".codebuddy/skills", hooks: "none", memoryFile: "AGENTS.md" },
];

export interface ResolvedAgent extends AgentAdapter {
  /** Absolute home dir. */
  home: string;
  /** True when the home dir exists (the user actually uses this agent). */
  installed: boolean;
}

export function getAgent(id: string): AgentAdapter | undefined {
  return KNOWN_AGENTS.find((agent) => agent.id === id.toLowerCase());
}

/**
 * Home directory for agent homes. Re-exported here so agent-related code has
 * a single import; the override lives in paths.ts next to resolveRoot.
 */
export { userHome };

export function homePath(...segments: string[]): string {
  return join(userHome(), ...segments);
}

/** Resolve every known agent to absolute paths + installation state. */
export function detectAgents(): ResolvedAgent[] {
  return KNOWN_AGENTS.map((agent) => {
    const home = homePath(agent.homeDir);
    return { ...agent, home, installed: existsSync(home) };
  });
}

/**
 * Pick the fan-out targets: explicit `config.agents` ids win; an empty list
 * means "every installed agent except the one that owns the sync root".
 * Unknown ids produce a warning and are skipped.
 */
export function selectAgents(
  configured: string[],
  root: string,
  onWarning: (message: string) => void = () => undefined,
): ResolvedAgent[] {
  const detected = detectAgents();
  const byId = new Map(detected.map((agent) => [agent.id, agent]));

  if (configured.length > 0) {
    const selected: ResolvedAgent[] = [];
    for (const raw of configured) {
      const id = raw.toLowerCase();
      const agent = byId.get(id);
      if (!agent) {
        onWarning(`Unknown agent "${raw}" — known agents: ${KNOWN_AGENTS.map((a) => a.id).join(", ")}`);
        continue;
      }
      if (agent.home === root) continue; // never fan out into the sync root itself
      selected.push(agent);
    }
    return selected;
  }

  return detected.filter((agent) => agent.installed && agent.home !== root);
}
