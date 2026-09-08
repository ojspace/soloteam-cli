# soloteam-cli

Config sync and friction-based memory nudges for a solo developer running Claude Code (or any agent CLI that supports SessionStart/Stop hooks).

Inspired by [Tencent's teamai-cli](https://github.com/Tencent/teamai-cli), which distributes skills/rules/mcp/hooks across a *team* via a git push → merge-request → pull workflow, with automatic friction-scored learning capture and knowledge recall. soloteam-cli is a clean-room reimplementation of the two ideas that still make sense with a team of one — no MR review, no shared knowledge base, no dashboard. Just: keep your config in sync across your own machines, and get nudged when a session was worth remembering.

## What it does

1. **Config sync** — `CLAUDE.md`, `rules/`, `context/`, `commands/` (or whatever you list) live in a real git repo. `pull` on session start, `push` on session stop, both automatic via hooks. No manual `git add/commit/push`, no merge conflicts to babysit across machines.
2. **Friction detector** — on every Stop, scans the session transcript for interruptions, tool errors, and short corrective replies ("no", "don't", "wrong", "undo"...). If the score crosses a threshold, it nudges you once per session to save what happened to memory. It never writes memory itself — that decision stays with you (or your agent).

## Install

```bash
git clone https://github.com/orkhan-j/soloteam-cli
cd soloteam-cli
bun install
bun link   # or: bun build src/index.ts --compile --outfile dist/soloteam && sudo mv dist/soloteam /usr/local/bin/
```

## Quick start

```bash
# 1. Create a bare repo somewhere you control (your own VPS, a private GitHub repo, anywhere reachable over git+ssh)
ssh you@your-server "git init --bare -b main /path/to/claude-config.git"

# 2. Point soloteam at it
soloteam init you@your-server:/path/to/claude-config.git

# 3. Wire it into hooks (edits settings.json in place, additive + idempotent)
soloteam hooks install

# 4. Sanity check
soloteam doctor
```

From here: SessionStart pulls, Stop pushes if anything under the tracked paths changed, and Stop also runs the friction check. Nothing to remember to do manually.

## Commands

| Command | What it does |
|---|---|
| `soloteam init <remote>` | Create `soloteam.yaml`, git-init the config root, set the remote, first commit + push |
| `soloteam pull` | Fast-forward-only pull; no-ops quietly if local edits are pending or remote is unreachable |
| `soloteam push` | Commit + push tracked paths if anything changed; no-op if clean |
| `soloteam status` | Local diff + ahead/behind vs the remote |
| `soloteam doctor` | Checks config validity, remote reachability, hooks installed |
| `soloteam hooks install` | Merges the pull/push/friction-check commands into `settings.json` — additive, safe to re-run |
| `soloteam friction-check` | Reads a Stop-hook JSON payload from stdin, scores the transcript, nudges once per session |

All commands accept `--dir <path>` (defaults to `$SOLOTEAM_DIR` or `~/.claude`).

## Config (`soloteam.yaml`)

```yaml
remote: you@your-server:/path/to/claude-config.git
branch: main
track:
  - CLAUDE.md
  - rules/
  - context/
  - commands/
mirrors: []          # optional: also copy tracked files verbatim into other dirs
friction:
  threshold: 5
  weights:
    interruption: 3
    error: 1
    correction: 2
```

`pull`/`push` only ever touch the paths listed in `track` — everything else in the config root (session history, caches, auth tokens) is left alone. The `.gitignore` soloteam writes is an allowlist: ignore everything, then explicitly un-ignore `track` entries.

## Why not just use teamai-cli solo?

You can — it works standalone. But its unit of design is a team: MR-gated push, role/tag-scoped distribution, a shared knowledge base with BM25 recall, a usage dashboard for teammates. None of that has a job to do with one person on one (or two) machines. soloteam-cli is the subset that's still useful once you remove the "team" — direct push, no review gate, no shared KB, no dashboard — plus a friction detector that points at *your own* memory system instead of a shared repo.

## License

MIT
