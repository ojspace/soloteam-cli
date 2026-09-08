import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDigest, formatDigest, saveSession } from "./sessions";

describe("sessions + digest", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "soloteam-sessions-"));
  });
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });

  test("save appends to monthly log, digest aggregates", async () => {
    const rel = await saveSession(root, {
      sessionId: "abc",
      date: "2026-09-01",
      tools: 10,
      interruptions: 1,
      errors: 2,
      corrections: 0,
      score: 5,
      note: "fixed ports",
    });
    expect(rel).toBe(join("sessions", "2026-09.md"));
    await saveSession(root, {
      sessionId: "def",
      date: "2026-09-02",
      tools: 4,
      interruptions: 0,
      errors: 0,
      corrections: 0,
      score: 0,
      note: "",
    });

    const digest = await buildDigest(root, "2026-09-01");
    expect(digest.sessions).toBe(2);
    expect(digest.tools).toBe(14);
    expect(digest.friction).toBe(5);
    expect(digest.highFriction.length).toBe(1);
    expect(digest.byDay.length).toBe(2);

    const text = formatDigest(digest);
    expect(text).toContain("sessions: 2");
    expect(text).toContain("fixed ports");

    // since-filter excludes older entries
    const recent = await buildDigest(root, "2026-09-02");
    expect(recent.sessions).toBe(1);
  });

  test("missing sessions dir digests to zero", async () => {
    const digest = await buildDigest(root, "2026-01-01");
    expect(digest.sessions).toBe(0);
  });

  test("log file is readable markdown", async () => {
    await saveSession(root, {
      sessionId: "x", date: "2026-09-03", tools: 1,
      interruptions: 0, errors: 0, corrections: 0, score: 0, note: "",
    });
    const content = await readFile(join(root, "sessions", "2026-09.md"), "utf8");
    expect(content).toContain("## 2026-09-03");
  });
});
