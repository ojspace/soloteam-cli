import { homedir } from "node:os";
import { join } from "node:path";

/** OS home, overridable via SOLOTEAM_HOME (tests, dry runs). */
export function userHome(): string {
  return process.env.SOLOTEAM_HOME ?? homedir();
}

/** Resolve the synced config root: --dir flag > SOLOTEAM_DIR env > ~/.claude. */
export function resolveRoot(dirFlag?: string): string {
  if (dirFlag) return dirFlag;
  if (process.env.SOLOTEAM_DIR) return process.env.SOLOTEAM_DIR;
  return join(userHome(), ".claude");
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
