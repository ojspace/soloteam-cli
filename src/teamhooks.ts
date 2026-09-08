import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const DeclaredHookSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  /** Hook event, e.g. Stop, SessionStart, PreToolUse, PostToolUse. */
  event: z.string().default("Stop"),
  matcher: z.string().optional(),
  command: z.string().min(1),
  /** Agent ids this hook applies to. Empty = all agents that support hooks. */
  tools: z.array(z.string()).default([]),
});

export type DeclaredHook = z.infer<typeof DeclaredHookSchema>;

const HooksFileSchema = z.object({
  hooks: z.array(DeclaredHookSchema).default([]),
});

export function hooksFilePath(root: string): string {
  return join(root, "hooks", "hooks.yaml");
}

/**
 * Load the declarative hooks file (`hooks/hooks.yaml`). Returns [] when the
 * file doesn't exist — declarative hooks are opt-in; the pull/push lifecycle
 * hooks are always managed separately.
 */
export async function loadDeclaredHooks(root: string): Promise<DeclaredHook[]> {
  const path = hooksFilePath(root);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  return HooksFileSchema.parse(parseYaml(raw)).hooks;
}

/** True when a declared hook applies to the given agent id. */
export function hookAppliesTo(hook: DeclaredHook, agentId: string): boolean {
  return hook.tools.length === 0 || hook.tools.some((tool) => tool.toLowerCase() === agentId);
}
