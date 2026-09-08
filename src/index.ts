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
import { cmdPull } from "./commands/pull";
import { cmdPush } from "./commands/push";
import { cmdRecall } from "./commands/recall";
import { cmdStatus } from "./commands/status";
import { cmdUninstall } from "./commands/uninstall";

const HELP = `soloteam — one developer, every machine, every agent in sync

Sync (git repo of truth, direct to main):
  soloteam init <git-remote-url> [--dir <path>] [--track a,b,c]
  soloteam pull [--dir <path>] [--strict]
  soloteam push [--dir <path>] [--message <msg>] [--strict]
  soloteam status [--dir <path>]

Agents, hooks, MCP (declared once, delivered on pull):
  soloteam agents [--all]
  soloteam hooks [install|list|remove] [--dir <path>] [--settings <path>]
  soloteam mcp [list|inject|remove] [--dir <path>] [--agent <id>]
  soloteam exclude [list|add <path>|remove <path>]

Memory (local-first: learnings + recall + sessions):
  soloteam learn "Title" [--body <text>|--file <path>]
  soloteam recall <query> [--limit N] | soloteam recall [enable|disable|status]
  soloteam friction-check [--dir <path>]   (reads Stop-hook JSON from stdin)
  soloteam session save [--note <text>] [--push]
  soloteam digest [--since YYYY-MM-DD]

Setup & health:
  soloteam doctor [--dir <path>] [--settings <path>]
  soloteam uninstall [--dir <path>] [--purge]

--dir defaults to $SOLOTEAM_DIR or ~/.claude.
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
