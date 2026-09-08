import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SessionRecord {
  sessionId: string;
  date: string; // YYYY-MM-DD
  tools: number;
  interruptions: number;
  errors: number;
  corrections: number;
  score: number;
  note: string;
}

function monthFile(root: string, yearMonth: string): string {
  return join(root, "sessions", `${yearMonth}.md`);
}

/** Append a session record to the monthly log. Returns the repo-relative path. */
export async function saveSession(root: string, record: SessionRecord): Promise<string> {
  const yearMonth = record.date.slice(0, 7);
  const file = monthFile(root, yearMonth);
  await mkdir(join(root, "sessions"), { recursive: true });
  const header = existsSync(file) ? "" : `# Sessions — ${yearMonth}\n\nPersonal session log, synced across machines by soloteam.\n`;
  const entry = `\n## ${record.date} · \`${record.sessionId}\`\n\n- tools: ${record.tools}, interruptions: ${record.interruptions}, errors: ${record.errors}, corrections: ${record.corrections}, friction: ${record.score}\n- note: ${record.note.trim() === "" ? "—" : record.note.trim()}\n`;
  await appendFile(file, `${header}${entry}`, "utf8");
  return join("sessions", `${yearMonth}.md`);
}

export interface DigestDay {
  date: string;
  sessions: number;
  tools: number;
  friction: number;
}

export interface Digest {
  since: string;
  sessions: number;
  tools: number;
  friction: number;
  highFriction: { date: string; sessionId: string; score: number; note: string }[];
  byDay: DigestDay[];
}

const ENTRY_RE = /^## (\d{4}-\d{2}-\d{2}) · `([^`]+)`\s*\n\n- tools: (\d+), interruptions: (\d+), errors: (\d+), corrections: (\d+), friction: ([\d.]+)\n- note: (.*)$/gm;

/**
 * Aggregate the session logs since `since` (YYYY-MM-DD, inclusive).
 * Pure log parsing — no tracking daemon involved.
 */
export async function buildDigest(root: string, since: string): Promise<Digest> {
  const dir = join(root, "sessions");
  const digest: Digest = { since, sessions: 0, tools: 0, friction: 0, highFriction: [], byDay: [] };
  if (!existsSync(dir)) return digest;

  const files = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
  const days = new Map<string, DigestDay>();
  for (const name of files) {
    const content = await readFile(join(dir, name), "utf8").catch(() => "");
    for (const match of content.matchAll(ENTRY_RE)) {
      const parts = match.slice(1);
      const date = parts[0] ?? "";
      if (date < since) continue;
      const sessionId = parts[1] ?? "";
      const toolCount = Number(parts[2] ?? 0);
      const friction = Number(parts[6] ?? 0);
      const note = (parts[7] ?? "").trim();
      digest.sessions++;
      digest.tools += toolCount;
      digest.friction += friction;
      const day = days.get(date) ?? { date, sessions: 0, tools: 0, friction: 0 };
      day.sessions++;
      day.tools += toolCount;
      day.friction += friction;
      days.set(date, day);
      if (friction >= 5) {
        digest.highFriction.push({ date, sessionId, score: friction, note });
      }
    }
  }
  digest.byDay = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  digest.highFriction.sort((a, b) => b.score - a.score);
  return digest;
}

export function formatDigest(digest: Digest): string {
  const lines = [
    `Personal digest since ${digest.since}`,
    `  sessions: ${digest.sessions}, tool calls: ${digest.tools}, total friction: ${digest.friction}`,
  ];
  for (const day of digest.byDay) {
    lines.push(`  ${day.date}: ${day.sessions} session(s), ${day.tools} tools, friction ${day.friction}`);
  }
  if (digest.highFriction.length > 0) {
    lines.push("High-friction sessions worth reviewing:");
    for (const hit of digest.highFriction.slice(0, 10)) {
      lines.push(`  ${hit.date} ${hit.sessionId} (friction ${hit.score}) — ${hit.note || "no note"}`);
    }
  }
  return lines.join("\n");
}
