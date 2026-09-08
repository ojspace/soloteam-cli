import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Local knowledge recall. Searches markdown under `learnings/` plus the
 * tracked knowledge dirs (`rules/`, `context/`, `commands/`, `skills/`,
 * `agents/`, `docs/`) with plain TF-IDF — no server, no index daemon, no
 * dependencies. Solo-scale corpora (tens to hundreds of files) search in
 * milliseconds by scanning on demand.
 */

const STOPWORDS = new Set(
  "a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,it,its,this,that,these,those,i,you,we,they,he,she,my,your,our,their,do,does,did,not,no,yes,can,will,just,so,than,too,very,how,what,when,where,why,which,who,whom,into,over,after,before,between,through,up,out,about,also,there,here,have,has,had,having".split(","),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_+-]+/)
    .map((token) => token.replace(/^[_+-]+|[_+-]+$/g, ""))
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export interface RecallDoc {
  path: string;
  title: string;
  score: number;
  excerpt: string;
}

interface CorpusEntry {
  path: string;
  title: string;
  body: string;
  terms: Map<string, number>;
  titleTerms: Set<string>;
}

function titleOf(rel: string, content: string): string {
  const heading = content.split("\n").find((line) => line.startsWith("# "));
  if (heading) return heading.replace(/^# /, "").trim();
  const name = rel.split("/").pop() ?? rel;
  return name.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function excerptFor(content: string, queryTerms: Set<string>): string {
  const lines = content.split("\n").filter((line) => line.trim().length > 0 && !line.startsWith("#"));
  const hit = lines.find((line) => tokenize(line).some((token) => queryTerms.has(token)));
  const chosen = hit ?? lines[0] ?? "";
  return chosen.trim().slice(0, 240);
}

async function collectMarkdown(dir: string, out: string[]): Promise<void> {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdown(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
}

const KNOWLEDGE_DIRS = ["learnings", "rules", "context", "commands", "skills", "agents", "docs"];

/** All searchable markdown files under the sync root. */
export async function collectCorpusFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const dir of KNOWLEDGE_DIRS) {
    await collectMarkdown(join(root, dir), files);
  }
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const full = join(root, name);
    if (existsSync(full)) files.push(full);
  }
  return files.sort();
}

/** Search the local knowledge corpus. Returns at most `limit` ranked docs. */
export async function searchKnowledge(root: string, query: string, limit = 5): Promise<RecallDoc[]> {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const files = await collectCorpusFiles(root);
  if (files.length === 0) return [];

  const entries: CorpusEntry[] = [];
  for (const full of files) {
    const content = await readFile(full, "utf8").catch(() => "");
    if (!content.trim()) continue;
    const terms = new Map<string, number>();
    for (const token of tokenize(content)) terms.set(token, (terms.get(token) ?? 0) + 1);
    entries.push({
      path: relative(root, full),
      title: titleOf(relative(root, full), content),
      body: content,
      terms,
      titleTerms: new Set(tokenize(titleOf(relative(root, full), content))),
    });
  }
  if (entries.length === 0) return [];

  const docFreq = new Map<string, number>();
  for (const entry of entries) {
    for (const term of entry.terms.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const idf = (term: string): number =>
    Math.log((entries.length + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;

  const querySet = new Set(queryTerms);
  const scored: RecallDoc[] = [];
  for (const entry of entries) {
    let score = 0;
    for (const term of queryTerms) {
      const tf = entry.terms.get(term) ?? 0;
      if (tf > 0) score += (1 + Math.log(tf)) * idf(term);
      if (entry.titleTerms.has(term)) score += 2 * idf(term);
      if (entry.path.toLowerCase().includes(term)) score += idf(term);
    }
    if (score > 0) {
      scored.push({ path: entry.path, title: entry.title, score, excerpt: excerptFor(entry.body, querySet) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ─── learn ──────────────────────────────────────────────────────────────────

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

export function todayPrefix(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Write a learning note. Returns the repo-relative path. */
export async function saveLearning(root: string, title: string, body: string): Promise<string> {
  const dir = join(root, "learnings");
  await mkdir(dir, { recursive: true });
  const rel = join("learnings", `${todayPrefix()}-${slugify(title)}.md`);
  const content = `# ${title}\n\n_Date: ${todayPrefix()}_\n\n${body.trim()}\n`;
  await writeFile(join(root, rel), content, "utf8");
  return rel;
}

// ─── recall guidance (agent auto-search) ────────────────────────────────────

export const RECALL_GUIDANCE_FILE = join("rules", "soloteam-recall.md");

const GUIDANCE_BODY = `# Recall shared knowledge before tasks

Your synced knowledge (learnings, rules, context) is searchable locally.
Before starting a non-trivial task, run:

\`\`\`bash
soloteam recall "<keywords from the task>"
\`\`\`

and fold the top hits into your plan. This file is managed by
\`soloteam recall enable\` / \`soloteam recall disable\` — delete it or run
disable to opt out.
`;

/** Enable = drop the guidance rule into rules/ (synced everywhere on push). */
export async function enableRecall(root: string): Promise<string> {
  const dir = join(root, "rules");
  await mkdir(dir, { recursive: true });
  const full = join(root, RECALL_GUIDANCE_FILE);
  await writeFile(full, GUIDANCE_BODY, "utf8");
  return RECALL_GUIDANCE_FILE;
}

export async function disableRecall(root: string): Promise<boolean> {
  const full = join(root, RECALL_GUIDANCE_FILE);
  if (!existsSync(full)) return false;
  await rm(full);
  return true;
}

export function recallEnabled(root: string): boolean {
  return existsSync(join(root, RECALL_GUIDANCE_FILE));
}
