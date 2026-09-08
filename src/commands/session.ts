import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { loadConfig } from "../config";
import { countToolUses, extractSignals, scoreSignals } from "../friction";
import { resolveRoot } from "../paths";
import { readStdin } from "../runtime";
import { buildDigest, formatDigest, saveSession } from "../sessions";
import { cmdPush } from "./push";

interface SessionPayload {
  transcript_path?: string;
  session_id?: string;
}

/**
 * Record a privacy-scrubbed session summary to sessions/ (synced by push).
 * Only stores counts + your note — never prompts, code, or file contents.
 *
 *   soloteam session save --note "fixed the port-conflict bug" [--push]
 *   soloteam digest [--since 2026-09-01]
 */
export async function cmdSession(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const sub = args.positional[0];

  if (sub !== "save") {
    console.error("Usage: soloteam session save [--note <text>] [--transcript <path>] [--session <id>] [--push]");
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig(root);
  let transcriptPath = flagString(args.flags, "transcript");
  let sessionId = flagString(args.flags, "session") ?? `manual-${Date.now()}`;

  if (!transcriptPath) {
    const stdin = await readStdin();
    if (stdin.trim()) {
      try {
        const payload = JSON.parse(stdin) as SessionPayload;
        transcriptPath = payload.transcript_path ?? transcriptPath;
        sessionId = payload.session_id ?? sessionId;
      } catch {
        // not hook JSON — fall through to zero-count manual save
      }
    }
  }

  let tools = 0;
  let signals = { interruptions: 0, errors: 0, corrections: 0 };
  if (transcriptPath && existsSync(transcriptPath)) {
    const transcript = await readFile(transcriptPath, "utf8");
    tools = countToolUses(transcript);
    signals = extractSignals(transcript);
  }
  const score = scoreSignals(signals, config.friction.weights);
  const note = flagString(args.flags, "note") ?? "";

  const rel = await saveSession(root, {
    sessionId,
    date: new Date().toISOString().slice(0, 10),
    tools,
    ...signals,
    score,
    note,
  });
  console.log(`Saved session ${sessionId} → ${rel} (tools=${tools}, friction=${score})`);

  if (args.flags.push) {
    await cmdPush({ positional: [], flags: { dir: root } });
  }
}

export async function cmdDigest(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));
  const since =
    flagString(args.flags, "since") ??
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const digest = await buildDigest(root, since);
  console.log(formatDigest(digest));
}
