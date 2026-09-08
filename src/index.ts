#!/usr/bin/env bun
import { parseArgs } from "./args";
import { cmdDoctor } from "./commands/doctor";
import { cmdFrictionCheck } from "./commands/frictionCheck";
import { cmdHooksInstall } from "./commands/hooksInstall";
import { cmdInit } from "./commands/init";
import { cmdPull } from "./commands/pull";
import { cmdPush } from "./commands/push";
import { cmdStatus } from "./commands/status";

const HELP = `soloteam — config sync + friction-based memory nudges for solo agent CLI setups

Usage:
  soloteam init <git-remote-url> [--dir <path>] [--track a,b,c]
  soloteam pull [--dir <path>] [--strict]
  soloteam push [--dir <path>] [--message <msg>] [--strict]
  soloteam status [--dir <path>]
  soloteam doctor [--dir <path>] [--settings <path>]
  soloteam hooks install [--dir <path>] [--settings <path>]
  soloteam friction-check [--dir <path>]   (reads Stop-hook JSON from stdin)

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
    case "hooks":
      if (rest[0] === "install") {
        await cmdHooksInstall(parseArgs(rest.slice(1)));
      } else {
        console.error("Usage: soloteam hooks install [--dir <path>] [--settings <path>]");
        process.exitCode = 1;
      }
      break;
    case "friction-check":
      await cmdFrictionCheck(parseArgs(rest));
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
