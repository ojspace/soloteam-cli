import { execFile } from "node:child_process";

/**
 * Cross-runtime helpers. soloteam runs on Bun (dev, `bun link`, standalone
 * binary) and on plain Node (installed via `npm i -g soloteam-cli`), so no
 * `bun:*` imports are allowed in src/ — everything goes through here.
 */

/** Run `git <args>` in `cwd`. Never throws; reports `{ ok, stdout }`. */
export function runGit(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 30_000 }, (error, stdout) => {
      resolve({ ok: !error, stdout: String(stdout ?? "").trim() });
    });
  });
}

/** Read all of stdin as text. Resolves "" when stdin is a TTY or unreadable. */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
    // If stdin never ends (no pipe), don't hang hooks forever.
    setTimeout(() => resolve(data), 10_000).unref?.();
  });
}
