<p align="center">
  <img src="assets/soloteam-cli-logo.svg" alt="soloteam-cli">
</p>

# soloteam-cli — One Team. One You.

[![CI](https://github.com/ojspace/soloteam-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ojspace/soloteam-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/soloteam-cli.svg)](https://www.npmjs.com/package/soloteam-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Runtime: Node + Bun](https://img.shields.io/badge/runtime-node%20%7C%20bun-000000)](https://www.npmjs.com/package/soloteam-cli)

soloteam-cli keeps a solo developer's agent setup — `CLAUDE.md`, `rules/`, `skills/`, hooks, MCP servers, learnings — in sync across every machine **and every agent** they use, and turns hard-won sessions into searchable local memory.

It takes the three ideas from [Tencent's teamai-cli](https://github.com/Tencent/teamai-cli) that survive when "team" shrinks to one person — git-backed config sync, friction-scored session detection, local knowledge recall — drops everything that only makes sense for N people (merge-request review, roles, per-member dashboards), and goes further where solo hurts most: one memory file fanned out to all your agents, MCP declared once and injected everywhere, personal digests instead of team analytics.

## Table of contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Multi-agent fan-out](#multi-agent-fan-out)
- [Hooks](#hooks)
- [MCP servers](#mcp-servers)
- [Memory: learn, recall, sessions, digest](#memory-learn-recall-sessions-digest)
- [Configuration](#configuration)
- [Commands](#commands)
- [soloteam-cli vs teamai-cli](#soloteam-cli-vs-teamai-cli)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Quick start

```bash
# 1. Install (Node 18+ or Bun)
npm install -g soloteam-cli

# 2. Create a bare repo anywhere you control over git+ssh
#    (your own VPS, a private GitHub repo — anything reachable)
ssh you@your-server "git init --bare -b main /path/to/claude-config.git"

# 3. Point soloteam at it — git-inits ~/.claude, writes soloteam.yaml,
#    commits your config, pushes, and installs the lifecycle hooks
soloteam init you@your-server:/path/to/claude-config.git

# 4. Confirm everything is wired correctly
soloteam doctor
```

```
[OK  ] config file exists
[OK  ] root is a git repo
[OK  ] config valid
[OK  ] remote reachable — you@your-server:/path/to/claude-config.git
[OK  ] recommended paths tracked — all
[OK  ] agent targets — codex, cursor
[OK  ] hooks/hooks.yaml valid — 0 declared
[OK  ] mcp.yaml valid — 0 server(s)
[OK  ] recall guidance — disabled (`soloteam recall enable`)
[OK  ] claude hooks installed — /Users/you/.claude/settings.json
[OK  ] opencode plugin — not installed
```

That's the whole setup. Every session start pulls, every session stop pushes if anything changed, agents stay in sync, and hard sessions nudge you to save what you learned.

Prefer source? `git clone https://github.com/ojspace/soloteam-cli && cd soloteam-cli && bun install && bun run build && npm link`.

## How it works

**Sync** — two hooks, no daemon, no background process:

```
edit rules/security.md → Stop hook → soloteam push  → committed + pushed to main
                                                                              │
laptop's next session ◄── SessionStart hook ◄── soloteam pull ── (any machine) │
                                                                              ▼
                                              fan-out: AGENTS.md + skills → Codex,
                                              Cursor, OpenCode, OpenClaw … + hooks
                                              + MCP reconciled everywhere
```

- `soloteam pull` (SessionStart) fast-forward-only pulls. Uncommitted local edits → it backs off silently rather than risk a conflicted merge. After merging it delivers everything downstream: mirrors, per-agent fan-out, declarative hooks, MCP servers.
- `soloteam push` (Stop) commits + pushes only if something tracked actually changed. Nothing to commit → silent no-op.
- No reviewer, no merge request — you push straight to `main`, because you're the only reviewer that exists.

**Friction detection** — runs on the same Stop event, independently:

```
transcript.jsonl → count interruptions / tool errors / corrections → score
                                    │
                     score ≥ threshold, not yet notified this session
                                    │
                          "[friction] this session may be
                           worth saving to memory (...)"
```

## Multi-agent fan-out

You don't use one agent. soloteam doesn't sync to one agent. On every `pull`, your memory file and skills land in each installed agent's native layout:

| Agent | Detected via | Memory file | Skills | Hooks | MCP |
|---|---|---|---|---|---|
| Claude Code | `~/.claude` | `CLAUDE.md` | `skills/` | settings.json | `~/.claude.json` |
| Codex CLI | `~/.codex` | `AGENTS.md` | `skills/` | — | `config.toml` |
| Cursor | `~/.cursor` | `AGENTS.md` | `skills/` | — | `mcp.json` |
| OpenCode | `~/.config/opencode` | `AGENTS.md` | `skills/` | plugin | `opencode.json` |
| OpenClaw | `~/.openclaw` | `AGENTS.md` | `skills/` | — | — |
| Gemini, Copilot, Aider, Windsurf, Kiro, Qoder, CodeBuddy | `~/.<id>` | `AGENTS.md` | `skills/` | — | — |

`CLAUDE.md` becomes `AGENTS.md` everywhere else (every major agent reads it), `skills/` merges into each agent's skills dir, `rules/` + `commands/` + `context/` copy over best-effort. Detection is automatic — an agent counts when its home dir exists — or pin the set explicitly:

```yaml
agents: [codex, cursor]   # empty (default) = every installed agent
```

```bash
soloteam agents           # what was detected + what pull targets
soloteam agents --all     # all 12 known agents
soloteam exclude add sessions/private   # keep a path local-only
```

Raw verbatim copies to arbitrary dirs still work via `mirrors:` for anything exotic.

## Hooks

Lifecycle hooks (pull on start, push + friction-check on stop) install into Claude Code's `settings.json` idempotently, plus a tiny generated plugin for OpenCode. Your own hooks live in `hooks/hooks.yaml` and ship to every machine on pull:

```yaml
hooks:
  - id: block-secrets
    description: Scan for secrets before running commands
    event: PreToolUse
    matcher: Bash
    command: ./scan-secrets.sh
    tools: [claude]   # empty = every agent that supports hooks
```

```bash
soloteam hooks install   # lifecycle + declarative hooks
soloteam hooks list      # effective hooks per agent + declared file
soloteam hooks remove    # strip everything soloteam manages
```

## MCP servers

Declare once in `mcp.yaml`, get native config in every agent on pull. `${VAR}` secrets pass through untouched.

```yaml
servers:
  - name: gpu-analysis
    transport: http            # stdio | http | sse
    url: https://example.com/api/mcp
    headers:
      Authorization: Bearer ${GPU_ANALYSIS_TOKEN}
  - name: local-tools
    command: npx
    args: ["-y", "my-mcp"]
    env:
      TOKEN: ${MY_TOKEN}
```

```bash
soloteam mcp list             # declared servers + per-agent status
soloteam mcp inject           # write to all installed agents now
soloteam mcp inject --agent codex
soloteam mcp remove           # strip declared servers (yours stay)
```

Writes `~/.claude.json` (Claude), `~/.cursor/mcp.json` (Cursor), `~/.config/opencode/opencode.json` (OpenCode), and a managed `# soloteam:begin/end` block in `~/.codex/config.toml` (Codex) — your hand-written entries are never touched.

## Memory: learn, recall, sessions, digest

teamai-cli points friction at a shared team knowledge base. Solo, it points at **your** memory — a `learnings/` folder that syncs like everything else, searched locally with TF-IDF (no server, no index daemon, millisecond scans at solo scale):

```bash
soloteam learn "Port conflict fix" --body "Stale dev server was holding :3000…"
soloteam recall "port conflict"          # ranked hits with file paths
soloteam recall enable                   # agents auto-search before tasks
soloteam recall status                   # enabled/disabled
```

`recall enable` drops `rules/soloteam-recall.md` (synced everywhere) telling your agents to run `soloteam recall "<task keywords>"` before non-trivial work.

Sessions close the loop — privacy-scrubbed summaries (counts + your note, never prompts or code) in a synced monthly log, aggregated into a personal digest:

```bash
soloteam session save --note "fixed the port bug" --push
soloteam digest                    # last 7 days
soloteam digest --since 2026-09-01
```

```
Personal digest since 2026-09-01
  sessions: 9, tool calls: 214, total friction: 31
  2026-09-08: 2 session(s), 48 tools, friction 14
High-friction sessions worth reviewing:
  2026-09-08 manual-… (friction 14) — fixed the port bug
```

## Configuration

`soloteam init` writes `soloteam.yaml` into the config root:

```yaml
remote: you@your-server:/path/to/claude-config.git
branch: main
track:
  - CLAUDE.md
  - rules/
  - context/
  - commands/
  - skills/
  - agents/
  - hooks/
  - learnings/
  - sessions/
  - mcp.yaml
mirrors: []          # optional verbatim copies to extra dirs
agents: []           # [] = auto-detect installed agents
exclude: []          # path prefixes skipped during fan-out
friction:
  threshold: 5
  weights:
    interruption: 3
    error: 1
    correction: 2
```

| Key | Meaning |
|---|---|
| `remote` | Any `git`-reachable URL — SSH alias, `user@host:path`, or a hosted provider |
| `track` | Paths synced. Everything else — session history, caches, auth tokens — stays out via an allowlist `.gitignore` |
| `mirrors` | Extra dirs receiving a verbatim copy of every tracked path after each pull |
| `agents` | Fan-out targets; empty means every installed agent |
| `exclude` | Tracked prefixes that sync across machines but never fan out to agents |
| `friction.threshold` / `friction.weights` | `interruption` (cancelled tool call) ×3, `error` (failed tool call) ×1, `correction` (reply opening with "no"/"stop"/"don't"/"wrong"/"undo"/"revert"…) ×2 |

`--dir <path>` on any command overrides the root (default: `$SOLOTEAM_DIR`, else `~/.claude`). `SOLOTEAM_HOME` overrides the OS home for agent detection (tests, dry runs). `pull`/`push` accept `--strict` (exit non-zero instead of hook-safe silence).

## Commands

| Command | Description |
|---|---|
| `soloteam init <remote>` | Init root, write config, first commit + push, install hooks |
| `soloteam pull` | Fast-forward pull, then fan-out + hooks + MCP delivery |
| `soloteam push` | Commit + push tracked paths if changed; no-op if clean |
| `soloteam status` | Local diff + ahead/behind + agent targets |
| `soloteam doctor` | Config, remote, hooks, MCP/hook-file validity, agents, recall |
| `soloteam agents [--all]` | Detected agents and pull targets |
| `soloteam hooks [install\|list\|remove]` | Lifecycle + declarative hooks |
| `soloteam mcp [list\|inject\|remove]` | Declared MCP servers across agents |
| `soloteam exclude [list\|add\|remove]` | Local-only fan-out exclusions |
| `soloteam learn "Title"` | Save a learning note (`--body`, `--file`, or stdin) |
| `soloteam recall <query>` | Search local knowledge (`--limit N`) |
| `soloteam recall [enable\|disable\|status]` | Agent auto-search guidance |
| `soloteam friction-check` | Stop-hook scorer, nudges once per session |
| `soloteam session save` | Scrubbed session record (`--note`, `--push`) |
| `soloteam digest` | Personal usage digest (`--since`) |
| `soloteam uninstall [--purge]` | Remove hooks, plugin, state (config kept unless purged) |

## soloteam-cli vs teamai-cli

| | [teamai-cli](https://github.com/Tencent/teamai-cli) | soloteam-cli |
|---|---|---|
| Unit | A team (N developers) | One developer, N machines, M agents |
| Distribution | `push` → Merge Request → reviewer approves → `pull` | `push` → `pull`, direct to `main` — no reviewer exists |
| Agent coverage | 10 tools, team-administered | 12 tools, auto-detected per machine |
| Memory file | Per-tool team harness | One `CLAUDE.md` → `AGENTS.md` everywhere |
| Hooks | `hooks/hooks.yaml` → team review → pull | `hooks/hooks.yaml` → direct, live on next pull |
| MCP | `mcp/mcp.yaml` → team review → pull | `mcp.yaml` → direct, 4 native formats |
| Knowledge | Shared BM25 + graph-boosted recall | Local TF-IDF recall over your `learnings/` — instant, offline |
| Friction signal | Offers `/teamai-share-learnings` to the team repo | Nudges *you*, one command from `soloteam learn` |
| Sessions | Privacy-scrubbed summaries feed a team digest + dashboard | Same summaries feed a *personal* digest — no telemetry leaves your repo |
| Roles / tags / sources | Yes — scoping + subscriptions for N people | Replaced by `agents:` + `exclude:` — scoping for one person |
| Usage dashboard | Per-member tracking | `soloteam digest` — per-day counts, no tracking infrastructure |
| Codebase knowledge graph | tree-sitter AST + heuristic import graph | Out of scope — use a dedicated tool |
| Install | `npm i -g teamai-cli` | `npm i -g soloteam-cli` |

If you're syncing config across a real team, use teamai-cli — it does that job properly. soloteam-cli is for the gap it doesn't fill: one person, no reviewer, same discipline, zero ceremony.

## Troubleshooting

- **`soloteam doctor` says "remote reachable: FAIL"** — check `git ls-remote <url>` with the exact URL in `soloteam.yaml`; SSH key/agent issues show up here first.
- **`pull` never seems to run** — it backs off on uncommitted local edits by design. Run `soloteam push` first, or check `soloteam status`.
- **Hooks not firing** — confirm the `settings.json` your agent reads is the one installed into (`--settings <path>` otherwise), and that `soloteam` resolves on `PATH` in a non-interactive shell.
- **Friction nudge never shows up** — once per `session_id`; delete the marker under `.soloteam-state/friction/` to re-arm for testing.
- **Agent not detected** — detection = home dir exists (`~/.codex`, …). Launch the agent once, then `soloteam agents` to confirm.
- **Upgrading from 0.1.x** — new tracked paths (`skills/`, `agents/`, `hooks/`, `learnings/`, `sessions/`, `mcp.yaml`) only seed on fresh `init`. Add the ones you want to `track:` in `soloteam.yaml` (doctor flags missing ones), and use `recall enable` + `mcp list` to adopt the new features.

## Development

```bash
bun install
bun run typecheck
bun test            # 23 unit tests, no test deps (bun:test)
bun run build       # node-compatible dist/soloteam.js for npm
bun run build:binary  # standalone binary via bun compile
```

Small, single-purpose files under `src/` — `agents.ts` (registry), `fanout.ts`, `hooks.ts` + `teamhooks.ts`, `mcp.ts`, `opencode.ts`, `recall.ts`, `sessions.ts`, `friction.ts`, `runtime.ts` (node/bun compat — no `bun:*` imports in src), one file per command under `src/commands/`, colocated `*.test.ts`.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and PRs welcome. Scope rule: solo leverage only. If a feature needs a second person to make sense (reviews, roles, per-member analytics), it belongs in teamai-cli, not here.
