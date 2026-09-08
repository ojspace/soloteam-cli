import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgent, selectAgents } from "./agents";
import { fanoutToAgents } from "./fanout";
import {
  CODEX_BEGIN,
  CODEX_END,
  injectCodexMcp,
  injectJsonMcp,
  injectOpencodeMcp,
  loadMcpServers,
  removeCodexMcp,
  removeJsonMcp,
  removeOpencodeMcp,
} from "./mcp";
import { buildOpencodePlugin, OPENCODE_MARKER } from "./opencode";

const REAL_HOME = process.env.SOLOTEAM_HOME;

describe("agents", () => {
  test("registry lookups", () => {
    expect(getAgent("Claude")?.homeDir).toBe(".claude");
    expect(getAgent("nope")).toBeUndefined();
  });

  test("unknown configured ids warn and skip", () => {
    const warnings: string[] = [];
    expect(selectAgents(["nope"], "/tmp", (msg) => warnings.push(msg))).toEqual([]);
    expect(warnings.length).toBe(1);
  });
});

describe("fanout + mcp + opencode (isolated HOME)", () => {
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

  test("CLAUDE.md fans out to AGENTS.md, skills merge, exclude respected", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# me\n", "utf8");
    await mkdir(join(root, "skills", "review"), { recursive: true });
    await writeFile(join(root, "skills", "review", "SKILL.md"), "# review\n", "utf8");
    await mkdir(join(home, ".codex"), { recursive: true });

    const targets = selectAgents([], root);
    expect(targets.map((t) => t.id)).toContain("codex");

    const results = await fanoutToAgents(root, targets, ["skills/"]);
    const codex = results.find((r) => r.agent === "codex");
    expect(await readFile(join(home, ".codex", "AGENTS.md"), "utf8")).toBe("# me\n");
    expect(codex?.copied.join(" ")).toContain("AGENTS.md");

    // excluded skills/ must not land
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(home, ".codex", "skills"))).toBe(false);
  });

  test("mcp.yaml loads and injects to claude/cursor/opencode/codex", async () => {
    await writeFile(
      join(root, "mcp.yaml"),
      "servers:\n  - name: demo\n    command: npx\n    args: [-y, demo-mcp]\n    env: { TOKEN: abc }\n  - name: web\n    transport: http\n    url: https://example.com/mcp\n",
      "utf8",
    );
    const servers = await loadMcpServers(root);
    expect(servers.length).toBe(2);

    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".cursor"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await mkdir(join(home, ".codex"), { recursive: true });

    const { injectMcpEverywhere } = await import("./mcp");
    const results = await injectMcpEverywhere(servers);
    expect(results.map((r) => r.agent).sort()).toEqual(["claude", "codex", "cursor", "opencode"]);

    const claude = JSON.parse(await readFile(join(home, ".claude.json"), "utf8")) as {
      mcpServers: Record<string, { command?: string }>;
    };
    expect(claude.mcpServers.demo?.command).toBe("npx");

    const codex = await readFile(join(home, ".codex", "config.toml"), "utf8");
    expect(codex).toContain(CODEX_BEGIN);
    expect(codex).toContain(CODEX_END);
    expect(codex).toContain('command = "npx"');

    // remove roundtrips
    expect(await removeJsonMcp(join(home, ".claude.json"), ["demo", "web"])).toBe(2);
    expect(await removeOpencodeMcp(["demo", "web"])).toBe(2);
    expect(await removeCodexMcp()).toBe(true);
    expect(await removeCodexMcp()).toBe(false);
  });

  test("json inject merges without clobbering existing servers", async () => {
    const path = join(home, "mcp.json");
    await writeFile(path, JSON.stringify({ mcpServers: { keep: { command: "x" } } }), "utf8");
    await injectJsonMcp(path, [{ name: "new", transport: "stdio", command: "y", args: [], env: {}, headers: {} }]);
    const data = JSON.parse(await readFile(path, "utf8")) as { mcpServers: Record<string, unknown> };
    expect("keep" in data.mcpServers).toBe(true);
    expect("new" in data.mcpServers).toBe(true);
  });

  test("codex inject is idempotent (no duplicate blocks)", async () => {
    await mkdir(join(home, ".codex"), { recursive: true });
    const server = { name: "s", transport: "stdio" as const, command: "c", args: [], env: {}, headers: {} };
    await injectCodexMcp([server]);
    await injectCodexMcp([server]);
    const content = await readFile(join(home, ".codex", "config.toml"), "utf8");
    expect(content.split(CODEX_BEGIN).length).toBe(2); // one block
  });

  test("opencode plugin source carries marker + pull/push", () => {
    const source = buildOpencodePlugin("soloteam", root);
    expect(source).toContain(OPENCODE_MARKER);
    expect(source).toContain("SoloteamHooks");
    expect(source).toContain('"pull"');
    expect(source).toContain('"push"');
  });

  test("opencode mcp maps local/remote shapes", async () => {
    await injectOpencodeMcp([
      { name: "l", transport: "stdio", command: "npx", args: ["-y", "x"], env: {}, headers: {} },
      { name: "r", transport: "sse", url: "https://h", args: [], env: {}, headers: { A: "b" } },
    ]);
    const data = JSON.parse(await readFile(join(home, ".config", "opencode", "opencode.json"), "utf8")) as {
      mcp: Record<string, { type: string }>;
    };
    expect(data.mcp.l?.type).toBe("local");
    expect(data.mcp.r?.type).toBe("remote");
  });
});
