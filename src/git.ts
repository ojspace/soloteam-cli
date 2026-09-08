import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface GitResult {
  ok: boolean;
  stdout: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const result = await $`git ${args}`.cwd(cwd).quiet();
    return { ok: result.exitCode === 0, stdout: result.stdout.toString().trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

export function isGitRepo(root: string): boolean {
  return existsSync(join(root, ".git"));
}

export async function initRepo(root: string, branch: string): Promise<void> {
  await git(root, ["init", "-b", branch]);
}

export async function setRemote(root: string, url: string): Promise<void> {
  const existing = await git(root, ["remote", "get-url", "origin"]);
  if (existing.ok) {
    await git(root, ["remote", "set-url", "origin", url]);
  } else {
    await git(root, ["remote", "add", "origin", url]);
  }
}

export async function commitTracked(root: string, paths: string[], message: string): Promise<boolean> {
  // `git add` aborts entirely if any pathspec matches nothing (e.g. a tracked
  // path that hasn't been created yet), so only pass paths that exist.
  const existing = paths.filter((path) => existsSync(join(root, path)));
  if (existing.length === 0) return false;
  await git(root, ["add", "--", ...existing]);
  const result = await git(root, ["commit", "-q", "-m", message]);
  return result.ok;
}

export async function pushBranch(root: string, branch: string, setUpstream = false): Promise<GitResult> {
  const args = setUpstream ? ["push", "-u", "origin", branch] : ["push", "origin", branch];
  return git(root, args);
}

export async function fetch(root: string, branch: string): Promise<GitResult> {
  return git(root, ["fetch", "origin", branch]);
}

export async function ffMerge(root: string, branch: string): Promise<GitResult> {
  return git(root, ["merge", "--ff-only", `origin/${branch}`]);
}

export async function currentHead(root: string): Promise<string> {
  const result = await git(root, ["rev-parse", "HEAD"]);
  return result.stdout;
}

export async function diffNames(root: string, from: string, to: string): Promise<string[]> {
  const result = await git(root, ["diff", "--name-only", from, to]);
  return result.stdout ? result.stdout.split("\n") : [];
}

export async function porcelainStatus(root: string, paths: string[]): Promise<string> {
  const result = await git(root, ["status", "--porcelain", "--", ...paths]);
  return result.stdout;
}

export async function aheadBehind(root: string, branch: string): Promise<{ ahead: number; behind: number } | null> {
  const result = await git(root, ["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]);
  if (!result.ok || !result.stdout) return null;
  const parts = result.stdout.split(/\s+/);
  const ahead = Number(parts[0]);
  const behind = Number(parts[1]);
  if (Number.isNaN(ahead) || Number.isNaN(behind)) return null;
  return { ahead, behind };
}

export async function remoteReachable(root: string): Promise<boolean> {
  // No --exit-code: that flag reports failure for a reachable-but-empty
  // remote (exit 2, "no matching refs"), which is a valid pre-first-push state.
  const result = await git(root, ["ls-remote", "origin"]);
  return result.ok;
}
