import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  importFromJsonFile,
  importFromOpencodeFile,
  loadMcpServers,
  removeMcpServerFromFile,
  upsertMcpServer,
} from "./mcp";
import { buildTimeline } from "./timeline";
import { saveLearning } from "./recall";
import { saveSession } from "./sessions";

const REAL_HOME = process.env.SOLOTEAM_HOME;

describe("mcp add/remove/import (file-level, no YAML hand-edit)", () => {
  let home: string;
  let root: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "soloteam-home-"));
    root = await mkdtemp(join(tmpdir(), "soloteam-root-"));
    process.env.SOLOTEAM_HOME = home;
  });
  afterEach(async () => {
    if (REAL_HOME === undefined) delete process.env.SOLOTEAM_HOME;
    else process.env.SOLOTEAM_HOME = REAL_HOME;
    const { rm } = await import("node:fs/promises");
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  test("comment-only mcp.yaml loads as empty (starter file)", async () => {
    await writeFile(join(root, "mcp.yaml"), "# just comments\n# servers:\n", "utf8");
    expect(await loadMcpServers(root)).toEqual([]);
  });

  test("upsert adds then replaces by name, remove deletes", async () => {
    await upsertMcpServer(root, {
      name: "demo",
      transport: "stdio",
      command: "npx",
      args: ["-y", "a"],
      env: {},
      headers: {},
    });
    await upsertMcpServer(root, {
      name: "demo",
      transport: "stdio",
      command: "npx",
      args: ["-y", "b"],
      env: {},
      headers: {},
    });
    const servers = await loadMcpServers(root);
    expect(servers.length).toBe(1);
    expect(servers[0]?.args).toEqual(["-y", "b"]);
    expect(await removeMcpServerFromFile(root, "demo")).toBe(true);
    expect(await removeMcpServerFromFile(root, "demo")).toBe(false);
    expect(await loadMcpServers(root)).toEqual([]);
  });

  test("import from Claude/Cursor JSON and OpenCode JSON", async () => {
    const jsonPath = join(home, "mcp.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ mcpServers: { keep: { command: "npx", args: ["-y", "x"] }, web: { url: "https://h", type: "http" } } }),
      "utf8",
    );
    const fromJson = await importFromJsonFile(jsonPath);
    expect(fromJson.map((s) => s.name).sort()).toEqual(["keep", "web"]);

    const ocPath = join(home, "opencode.json");
    await writeFile(
      ocPath,
      JSON.stringify({ mcp: { l: { type: "local", command: ["npx", "-y", "x"] }, r: { type: "remote", url: "https://h" } } }),
      "utf8",
    );
    const fromOc = await importFromOpencodeFile(ocPath);
    expect(fromOc.map((s) => s.name).sort()).toEqual(["l", "r"]);
  });
});

describe("timeline (local learnings + sessions, newest first)", () => {
  let home: string;
  let root: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "soloteam-home-"));
    root = await mkdtemp(join(tmpdir(), "soloteam-root-"));
    process.env.SOLOTEAM_HOME = home;
  });
  afterEach(async () => {
    if (REAL_HOME === undefined) delete process.env.SOLOTEAM_HOME;
    else process.env.SOLOTEAM_HOME = REAL_HOME;
    const { rm } = await import("node:fs/promises");
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  test("empty timeline, then learning + session appear", async () => {
    expect(await buildTimeline(root)).toEqual([]);
    await saveLearning(root, "Port fix", "Stale dev server holding 3000");
    await mkdir(join(root, "sessions"), { recursive: true });
    await saveSession(root, {
      sessionId: "s1",
      date: new Date().toISOString().slice(0, 10),
      tools: 3,
      interruptions: 1,
      errors: 0,
      corrections: 0,
      score: 3,
      note: "fixed port",
    });
    const entries = await buildTimeline(root);
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.kind).sort()).toEqual(["learning", "session"]);
  });
});
