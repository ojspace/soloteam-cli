import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { saveLearning } from "./recall";

export interface TimelineEntry {
  date: string; // YYYY-MM-DD
  kind: "learning" | "session";
  title: string;
  path: string;
  excerpt: string;
}

function excerptOf(content: string): string {
  const lines = content.split("\n").filter((line) => line.trim().length > 0 && !line.startsWith("#"));
  return (lines[0] ?? "").trim().slice(0, 160);
}

function titleOfLearning(rel: string, content: string): string {
  const heading = content.split("\n").find((line) => line.startsWith("# "));
  if (heading) return heading.replace(/^# /, "").trim();
  return basename(rel).replace(/\.md$/, "").replace(/[-_]/g, " ");
}

async function collectLearnings(root: string): Promise<TimelineEntry[]> {
  const dir = join(root, "learnings");
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort().reverse();
  const out: TimelineEntry[] = [];
  for (const name of files.slice(0, 50)) {
    const full = join(dir, name);
    const content = await readFile(full, "utf8").catch(() => "");
    if (!content.trim()) continue;
    const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/);
    const rel = join("learnings", name);
    out.push({
      date: dateMatch?.[1] ?? "",
      kind: "learning",
      title: titleOfLearning(rel, content),
      path: rel,
      excerpt: excerptOf(content),
    });
  }
  return out;
}

const SESSION_ENTRY_RE = /^## (\d{4}-\d{2}-\d{2}) · `([^`]+)`\s*\n\n- tools: (\d+), interruptions: (\d+), errors: (\d+), corrections: (\d+), friction: ([\d.]+)\n- note: (.*)$/gm;

async function collectSessions(root: string): Promise<TimelineEntry[]> {
  const dir = join(root, "sessions");
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort().reverse();
  const out: TimelineEntry[] = [];
  for (const name of files.slice(0, 12)) {
    const content = await readFile(join(dir, name), "utf8").catch(() => "");
    for (const match of content.matchAll(SESSION_ENTRY_RE)) {
      const date = match[1] ?? "";
      const sessionId = match[2] ?? "";
      const note = (match[8] ?? "").trim();
      out.push({
        date,
        kind: "session",
        title: note || `session ${sessionId.slice(0, 8)}`,
        path: join("sessions", name),
        excerpt: `tools=${match[3]} friction=${match[7]}${note ? ` — ${note.slice(0, 120)}` : ""}`,
      });
    }
  }
  return out;
}

/** Recent learnings + sessions, newest first. Local files only — no daemon. */
export async function buildTimeline(root: string, limit = 20): Promise<TimelineEntry[]> {
  const [learnings, sessions] = await Promise.all([collectLearnings(root), collectSessions(root)]);
  const all = [...learnings, ...sessions];
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return all.slice(0, limit);
}

export function formatTimeline(entries: TimelineEntry[]): string {
  if (entries.length === 0) {
    return 'Nothing yet. Save your first note:\n  soloteam learn "Port fix" --body "Stale dev server was holding :3000"';
  }
  return entries
    .map((entry) => `${entry.date || "undated"} [${entry.kind}] ${entry.title} — ${entry.path}${entry.excerpt ? `\n    ${entry.excerpt}` : ""}`)
    .join("\n");
}

// ─── Import (bring your own markdown in, keep everything local) ─────────────

async function collectMarkdownFiles(dir: string, out: string[]): Promise<void> {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    // Skip heavy dirs that are never memory notes.
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".soloteam")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
}

function claudeMemCandidates(): string[] {
  const home = process.env.SOLOTEAM_HOME ?? homedir();
  return [
    join(home, ".claude-mem"),
    join(home, ".claude", "plugins", "marketplaces"),
    join(home, ".claude", "projects"),
  ];
}

/**
 * Import markdown notes from `fromDir` (or auto-detected claude-mem spots)
 * into learnings/. Returns the created repo-relative paths (max `limit`).
 */
export async function importMarkdownDir(root: string, fromDir: string, limit = 100): Promise<string[]> {
  const files: string[] = [];
  await collectMarkdownFiles(fromDir, files);
  const created: string[] = [];
  const destDir = join(root, "learnings");
  await mkdir(destDir, { recursive: true });

  for (const full of files.sort().slice(0, limit)) {
    const content = await readFile(full, "utf8").catch(() => "");
    if (content.trim().length < 20) continue;
    const base = basename(full, ".md").slice(0, 50).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() || "imported";
    const title = `Imported: ${base.replace(/-/g, " ")} (from ${basename(fromDir)})`;
    const rel = await saveLearning(root, title, `Source: ${relative(fromDir, full) || full}\n\n${content.trim().slice(0, 4000)}`);
    created.push(rel);
  }
  return created;
}

/** Try the known claude-mem locations; returns created paths. */
export async function importFromClaudeMem(root: string, explicitDir?: string): Promise<{ from: string; created: string[] }> {
  if (explicitDir) {
    const created = await importMarkdownDir(root, explicitDir);
    return { from: explicitDir, created };
  }
  for (const candidate of claudeMemCandidates()) {
    if (existsSync(candidate)) {
      const created = await importMarkdownDir(root, candidate, 50);
      if (created.length > 0) return { from: candidate, created };
    }
  }
  return { from: "", created: [] };
}
