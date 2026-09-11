<p align="center">
  <img src="assets/soloteam-cli-logo.svg" alt="soloteam-cli">
</p>

# soloteam-cli — one setup, every agent, every machine

[![CI](https://github.com/ojspace/soloteam-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ojspace/soloteam-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/soloteam-cli.svg)](https://www.npmjs.com/package/soloteam-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Runtime: Node + Bun](https://img.shields.io/badge/runtime-node%20%7C%20bun-000000)](https://www.npmjs.com/package/soloteam-cli)

Write your `CLAUDE.md`, skills, hooks, and MCP servers **once**. Use them in Claude Code, Codex, Cursor, OpenCode, and 8 more agents — on this machine and every other one. No daemon, no sign-in, no server. Just git + local files.

Inspired by [Tencent's teamai-cli](https://github.com/Tencent/teamai-cli) (built for teams), cut down for a team of one.

## Install

```bash
npm install -g soloteam-cli
# needs Node 18+ (or Bun). That's it.
```

## Use it in 60 seconds (local-first)

```bash
# 1. Start here — no remote, no VPS, no theory
soloteam init --local

# 2. Check the wiring
soloteam doctor
```

```
[OK  ] config file exists
[OK  ] root is a git repo
[OK  ] config valid
[OK  ] remote — local-only (no remote configured)
[OK  ] agent targets — claude, codex
[OK  ] mcp.yaml valid — 0 server(s)
[OK  ] recall guidance — enabled
[OK  ] claude hooks installed — /Users/you/.claude/settings.json
```

```bash
# 3. Add your first MCP server — no YAML editing
soloteam mcp add --name context7 --command npx --args "-y,@upstash/context7-mcp"
soloteam mcp list

# 4. Save + find your first lesson
soloteam learn "Port fix" --body "Stale dev server was holding :3000. Kill it, retry."
soloteam recall "port conflict"
soloteam timeline
```

Done. Your `CLAUDE.md` is already fanning out to every installed agent on each `soloteam pull` (automatic on session start via hooks).

## Sync across machines (when you're ready)

Local-first works. When you want a second machine in sync, point soloteam at a git repo you control:

```bash
# Option A: private GitHub repo (easiest)
gh repo create claude-config --private
soloteam init git@github.com:you/claude-config.git

# Option B: your own server
ssh you@your-server "git init --bare -b main /path/to/claude-config.git"
soloteam init you@your-server:/path/to/claude-config.git

# On the second machine:
soloteam init git@github.com:you/claude-config.git
# (pulls your CLAUDE.md, skills, hooks, MCP, learnings on first session start)
```

How sync works: `soloteam push` commits tracked files and pushes to `main`. `soloteam pull` fast-forwards and delivers to every agent. Uncommitted edits → pull backs off silently instead of merging over your work. No reviewer, no merge request — you're the only reviewer.

Already on `--local`? Add a remote later: edit `remote:` in `soloteam.yaml`, then `soloteam push`.

## Everyday use — 3 recipes

### 1. One memory file, every agent

Edit `CLAUDE.md` in your sync root (`~/.claude` by default). On next pull it lands as `AGENTS.md` in Codex, Cursor, OpenCode, Gemini, Copilot, and the rest — `skills/`, `rules/`, `commands/`, `context/` come along.

```bash
soloteam agents          # what pull targets on this machine
soloteam agents --all    # all 12 known agents
soloteam pull            # fan out now
```

### 2. MCP servers — declare once, use everywhere

```bash
# Local (stdio) server
soloteam mcp add --name my-tools --command npx --args "-y,my-mcp" --env "TOKEN=${MY_TOKEN}"

# Remote (HTTP/SSE) server — ${VAR} secrets pass through untouched
soloteam mcp add --name my-api --url https://example.com/mcp --header "Authorization=Bearer ${MY_TOKEN}"

# Already configured in Claude/Cursor/OpenCode? Pull it in, don't retype it
soloteam mcp import --from claude,cursor,opencode

# Write to agents now (pull does this automatically too)
soloteam mcp inject
soloteam mcp inject --agent codex

# Remove one server everywhere
soloteam mcp remove my-tools
```

Or edit `mcp.yaml` directly if you prefer — same result on next pull:

```yaml
servers:
  - name: context7
    command: npx
    args: ["-y", "@upstash/context7-mcp"]
  - name: my-api
    transport: http
    url: https://example.com/mcp
    headers:
      Authorization: Bearer ${MY_TOKEN}
```

Writes `~/.claude.json` (Claude), `~/.cursor/mcp.json` (Cursor), `~/.config/opencode/opencode.json` (OpenCode), and a managed `# soloteam:begin/end` block in `~/.codex/config.toml` (Codex). Your hand-written entries are never touched.

### 3. Remember what hurt

```bash
soloteam learn "Stripe webhook fix" --body "Test clock needed advancing 2h. Prod was fine."
echo "..." | soloteam learn "Title"          # pipe a note
soloteam learn "Title" --file ./note.md      # or from a file

soloteam recall "stripe webhook"             # search learnings + rules + skills
soloteam timeline                            # newest learnings + sessions
soloteam session save --note "fixed webhooks" --push
soloteam digest                              # last 7 days
soloteam digest --since 2026-09-01
```

After a rough session (interruptions, errors, corrections), the Stop hook nudges you with the exact commands to save it. Agents auto-search before tasks once `soloteam recall enable` is on (default for new inits; `disable` opts out). Everything is local markdown under `learnings/` + `sessions/` — searched with plain TF-IDF, no index daemon, synced like everything else.

Coming from claude-mem? Bring your notes, keep the local model:

```bash
soloteam memory import --from-claude-mem
soloteam memory import --from ~/my-notes
```

## How it works

Two hooks, no background process:

- **SessionStart → `soloteam pull`**: fast-forward git pull, then copy to mirrors, fan out to agents, install hooks, inject MCP.
- **Stop → `soloteam push` + friction check**: commit + push only if something tracked changed; separately count interruptions / tool errors / corrections and nudge once per session if the score passes your threshold.

Config lives in `soloteam.yaml` at the sync root:

```yaml
remote: git@github.com:you/claude-config.git  # or "local"
branch: main
track: [CLAUDE.md, rules/, context/, commands/, skills/, agents/, hooks/, learnings/, sessions/, mcp.yaml]
mirrors: []   # extra dirs getting a verbatim copy after each pull
agents: []    # [] = every installed agent; e.g. [codex, cursor] to pin
exclude: []   # tracked prefixes that sync but never fan out
friction: { threshold: 5, weights: { interruption: 3, error: 1, correction: 2 } }
```

`--dir <path>` overrides the root (`$SOLOTEAM_DIR`, else `~/.claude`). `SOLOTEAM_HOME` overrides home for agent detection. `pull`/`push` take `--strict` to exit non-zero instead of hook-safe silence.

## Agents

| Agent | Detected via | Memory | Skills | Hooks | MCP |
|---|---|---|---|---|---|
| Claude Code | `~/.claude` | `CLAUDE.md` | `skills/` | settings.json | `~/.claude.json` |
| Codex CLI | `~/.codex` | `AGENTS.md` | `skills/` | — | `config.toml` |
| Cursor | `~/.cursor` | `AGENTS.md` | `skills/` | — | `mcp.json` |
| OpenCode | `~/.config/opencode` | `AGENTS.md` | `skills/` | plugin | `opencode.json` |
| OpenClaw | `~/.openclaw` | `AGENTS.md` | `skills/` | — | — |
| Gemini, Copilot, Aider, Windsurf, Kiro, Qoder, CodeBuddy | `~/.<id>` | `AGENTS.md` | `skills/` | — | — |

Detection = home dir exists. `soloteam exclude add sessions/private` keeps a path synced but out of agents. `mirrors:` covers anything exotic.

## Commands

| What | Commands |
|---|---|
| Start | `init [--local \| <git-url>]`, `doctor`, `uninstall [--purge]` |
| Sync | `pull`, `push`, `status` |
| Agents / hooks / MCP | `agents [--all]`, `hooks [install\|list\|remove]`, `mcp [list\|add\|import\|inject\|remove [<name>]]`, `exclude [list\|add\|remove]` |
| Memory | `learn`, `recall [query\|enable\|disable\|status]`, `timeline`, `memory import`, `session save`, `digest`, `friction-check` |

## soloteam-cli vs teamai-cli vs claude-mem

| | teamai-cli | soloteam-cli | claude-mem |
|---|---|---|---|
| Built for | A team | One dev, N machines, M agents | Any agent, deep session memory |
| Sync | push → review → pull | push → pull, direct to main | Cloud sync / local worker |
| Agents | 10, team-administered | 12, auto-detected | Claude, Codex, Cursor, OpenCode… via plugin |
| Memory | Shared team KB (BM25 + graph) | Local `learnings/` (TF-IDF, offline) | Auto-captured observations (SQLite + vectors) |
| Setup | Team repo + roles | `init --local`, add remote later | `npx claude-mem install` + sign-in |
| Runtime | Hooks + git | Hooks + git, no daemon | Hooks + local worker service |

Use teamai-cli for a real team. Use claude-mem when you want everything auto-captured and searchable. Use soloteam-cli when you want one config + memory in git, working offline, in every agent, with zero services running.

## Troubleshooting

- **Start here:** `soloteam doctor` — it names the broken piece.
- **Remote FAIL:** `git ls-remote <url from soloteam.yaml>` — SSH key/agent issues show up first. Local-only? That's fine, `remote: local` is valid.
- **Pull does nothing:** by design it backs off on uncommitted edits. `soloteam push` first, then `soloteam status`.
- **Hooks not firing:** confirm the agent reads the `settings.json` soloteam wrote to, and `soloteam` is on `PATH` in non-interactive shells.
- **Nudge never shows:** once per `session_id`. Delete the marker under `.soloteam-state/friction/` to re-test.
- **Agent not detected:** launch the agent once (creates `~/.<id>`), then `soloteam agents`.
- **MCP not landing:** `soloteam mcp list` → `soloteam mcp inject` → check the agent's native file. Hand-written entries stay; declared ones merge in.
- **Upgrading from 0.1.x:** new tracked paths only seed on fresh `init`. Add them to `track:` manually; run `recall enable` + `mcp list` to adopt.

## Development

```bash
bun install
bun run typecheck
bun test            # bun:test, no extra deps
bun run build       # node-compatible dist/soloteam.js for npm
bun run build:binary  # standalone binary via bun compile
```

Small files under `src/` — `agents.ts`, `fanout.ts`, `hooks.ts` + `teamhooks.ts`, `mcp.ts`, `opencode.ts`, `recall.ts`, `timeline.ts`, `sessions.ts`, `friction.ts`, one file per command under `src/commands/`, colocated `*.test.ts`.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and PRs welcome. Scope rule: solo leverage only. If a feature needs a second person (reviews, roles, per-member analytics), it belongs in teamai-cli, not here.
