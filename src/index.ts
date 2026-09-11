#!/usr/bin/env node
import { parseArgs } from "./args";
import { cmdAgents } from "./commands/agents";
import { cmdDigest, cmdSession } from "./commands/session";
import { cmdDoctor } from "./commands/doctor";
import { cmdExclude } from "./commands/exclude";
import { cmdFrictionCheck } from "./commands/frictionCheck";
import { cmdHooks } from "./commands/hooks";
import { cmdInit } from "./commands/init";
import { cmdLearn } from "./commands/learn";
import { cmdMcp } from "./commands/mcp";
import { cmdMemory } from "./commands/memory";
import { cmdPull } from "./commands/pull";
import { cmdPush } from "./commands/push";
import { cmdRecall } from "./commands/recall";
import { cmdStatus } from "./commands/status";
import { cmdTimeline } from "./commands/timeline";
import { cmdUninstall } from "./commands/uninstall";

const HELP = `soloteam — one developer, every machine, every agent in sync

Start here:
  soloteam init --local                    # this machine only (fastest)
  soloteam init <git-url>                  # sync across machines (private repo or VPS)
  soloteam doctor                          # verify wiring

Daily sync (automatic via hooks, manual when you want):
  soloteam pull [--strict]
  soloteam push [--message <msg>]
  soloteam status

One config, every agent (auto-detected: Claude, Codex, Cursor, OpenCode…):
  soloteam agents [--all]
  soloteam hooks [install|list|remove]
  soloteam mcp list                        # what's declared + where it lands
  soloteam mcp add --name <id> --command <bin> [--args "a,b"] [--env K=V]
  soloteam mcp add --name <id> --url <https-url> [--header "K=V"]
  soloteam mcp import --from claude,cursor,opencode
  soloteam mcp inject | soloteam mcp remove [<name>]
  soloteam exclude [list|add <path>|remove <path>]

Memory (local files, no daemon, no sign-in):
  soloteam learn "Title" [--body <text>|--file <path>]   # save a lesson
  soloteam recall <query> [--limit N]                   # search learnings
  soloteam recall [enable|disable|status]               # agents auto-search
  soloteam timeline [--limit N]                         # newest learnings + sessions
  soloteam memory import (--from-claude-mem | --from <dir>)
  soloteam friction-check                  (Stop-hook scorer, nudges once per session)
  soloteam session save [--note <text>] [--push]
  soloteam digest [--since YYYY-MM-DD]

Setup & health:
  soloteam doctor
  soloteam uninstall [--purge]

--dir defaults to $SOLOTEAM_DIR or ~/.claude. SOLOTEAM_HOME overrides home (tests).
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "init":
      await cmdInit(parseArgs(rest));
      break;
    case "pull":
      await cmdPull(parseArgs(rest));
      break;
    case "push":
      await cmdPush(parseArgs(rest));
      break;
    case "status":
      await cmdStatus(parseArgs(rest));
      break;
    case "doctor":
      await cmdDoctor(parseArgs(rest));
      break;
    case "agents":
      await cmdAgents(parseArgs(rest));
      break;
    case "hooks":
      await cmdHooks(parseArgs(rest));
      break;
    case "mcp":
      await cmdMcp(parseArgs(rest));
      break;
    case "exclude":
      await cmdExclude(parseArgs(rest));
      break;
    case "learn":
      await cmdLearn(parseArgs(rest));
      break;
    case "recall":
      await cmdRecall(parseArgs(rest));
      break;
    case "timeline":
      await cmdTimeline(parseArgs(rest));
      break;
    case "memory":
      await cmdMemory(parseArgs(rest));
      break;
    case "friction-check":
      await cmdFrictionCheck(parseArgs(rest));
      break;
    case "session":
      await cmdSession(parseArgs(rest));
      break;
    case "digest":
      await cmdDigest(parseArgs(rest));
      break;
    case "uninstall":
      await cmdUninstall(parseArgs(rest));
      break;
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main();
