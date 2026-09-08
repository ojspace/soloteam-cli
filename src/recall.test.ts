import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disableRecall, enableRecall, recallEnabled, saveLearning, searchKnowledge, slugify, tokenize } from "./recall";

describe("tokenize", () => {
  test("lowercases, splits, and drops stopwords", () => {
    expect(tokenize("The Port-Conflict BUG!")).toEqual(["port-conflict", "bug"]);
    expect(tokenize("a")).toEqual([]);
  });
});

describe("slugify", () => {
  test("makes filename-safe slugs", () => {
    expect(slugify("Fix Port Conflict!")).toBe("fix-port-conflict");
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("searchKnowledge + learnings", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "soloteam-recall-"));
  });
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });

  test("finds the relevant learning first", async () => {
    await saveLearning(root, "Port conflict fix", "When two dev servers collide on port 3000, kill the stale one. Troubleshooting networking deploy.");
    await saveLearning(root, "Pasta recipe", "Boil water, add salt, cook spaghetti al dente.");
    const hits = await searchKnowledge(root, "port conflict networking");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toContain("port-conflict-fix");
  });

  test("empty corpus returns nothing", async () => {
    expect(await searchKnowledge(root, "anything")).toEqual([]);
  });

  test("enable/disable guidance roundtrip", async () => {
    expect(recallEnabled(root)).toBe(false);
    await enableRecall(root);
    expect(recallEnabled(root)).toBe(true);
    const body = await readFile(join(root, "rules", "soloteam-recall.md"), "utf8");
    expect(body).toContain("soloteam recall");
    expect(await disableRecall(root)).toBe(true);
    expect(recallEnabled(root)).toBe(false);
  });

  test("learning file has title + date frontmatter", async () => {
    const rel = await saveLearning(root, "My Title", "body text");
    expect(rel).toMatch(/^learnings\/\d{4}-\d{2}-\d{2}-my-title\.md$/);
    await mkdir(join(root, "x"), { recursive: true });
    await writeFile(join(root, "x.md"), "# hi\n", "utf8");
  });
});
