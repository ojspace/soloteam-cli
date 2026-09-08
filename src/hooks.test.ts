import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHooks, listManagedHooks, removeManagedHooks } from "./hooks";
import { hookAppliesTo, loadDeclaredHooks } from "./teamhooks";

describe("claude settings hooks", () => {
  test("install is idempotent, list sees, remove strips", async () => {
    const dir = await mkdtemp(join(tmpdir(), "soloteam-hooks-"));
    const settings = join(dir, "settings.json");
    await writeFile(settings, JSON.stringify({ theme: "dark" }), "utf8");

    const first = await installHooks(settings, "soloteam", dir);
    expect(first.length).toBe(2);
    const second = await installHooks(settings, "soloteam", dir);
    expect(second).toEqual([]);

    // unrelated keys survive
    const raw = JSON.parse(await readFile(settings, "utf8")) as { theme: string };
    expect(raw.theme).toBe("dark");

    const listed = await listManagedHooks(settings);
    expect(listed.length).toBe(3); // pull + push + friction-check

    const removed = await removeManagedHooks(settings);
    expect(removed).toBe(3);
    expect(await listManagedHooks(settings)).toEqual([]);
    expect(await removeManagedHooks(join(dir, "missing.json"))).toBe(0);
  });
});

describe("hooks/hooks.yaml", () => {
  test("loads declared hooks and matches tools", async () => {
    const dir = await mkdtemp(join(tmpdir(), "soloteam-teamhooks-"));
    expect(await loadDeclaredHooks(dir)).toEqual([]);

    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "hooks"), { recursive: true });
    await writeFile(
      join(dir, "hooks", "hooks.yaml"),
      "hooks:\n  - id: scan\n    event: PreToolUse\n    matcher: Bash\n    command: ./scan.sh\n    tools: [claude]\n",
      "utf8",
    );
    const hooks = await loadDeclaredHooks(dir);
    expect(hooks.length).toBe(1);
    expect(hookAppliesTo(hooks[0]!, "claude")).toBe(true);
    expect(hookAppliesTo(hooks[0]!, "codex")).toBe(false);

    // declarative hooks merge into settings on install
    const settings = join(dir, "settings.json");
    const added = await installHooks(settings, "soloteam", dir, hooks, "claude");
    expect(added).toContain("PreToolUse: scan");
  });
});
