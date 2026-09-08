import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the synced config root: --dir flag > SOLOTEAM_DIR env > ~/.claude. */
export function resolveRoot(dirFlag?: string): string {
  if (dirFlag) return dirFlag;
  if (process.env.SOLOTEAM_DIR) return process.env.SOLOTEAM_DIR;
  return join(homedir(), ".claude");
}

export function configPath(root: string): string {
  return join(root, "soloteam.yaml");
}

export function stateDir(root: string): string {
  return join(root, ".soloteam-state");
}

export function frictionMarker(root: string, sessionId: string): string {
  return join(stateDir(root), "friction", `${sessionId}.notified`);
}
