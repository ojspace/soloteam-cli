import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ParsedArgs } from "../args";
import { flagString } from "../args";
import { loadConfig } from "../config";
import { extractSignals, scoreSignals } from "../friction";
import { frictionMarker, resolveRoot } from "../paths";
import { readStdin } from "../runtime";

interface StopHookPayload {
  transcript_path?: string;
  session_id?: string;
}

export async function cmdFrictionCheck(args: ParsedArgs): Promise<void> {
  const root = resolveRoot(flagString(args.flags, "dir"));

  const stdin = await readStdin();
  let payload: StopHookPayload;
  try {
    payload = JSON.parse(stdin) as StopHookPayload;
  } catch {
    return;
  }

  const { transcript_path: transcriptPath, session_id: sessionId } = payload;
  if (!transcriptPath || !sessionId) return;

  const marker = frictionMarker(root, sessionId);
  if (existsSync(marker)) return;

  let config;
  try {
    config = await loadConfig(root);
  } catch {
    return;
  }

  if (!existsSync(transcriptPath)) return;
  const transcript = await readFile(transcriptPath, "utf8");
  const signals = extractSignals(transcript);
  const score = scoreSignals(signals, config.friction.weights);

  if (score < config.friction.threshold) return;

  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, `${score}\n`, "utf8");

  const reasons = Object.entries(signals)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");

  console.error(
    `[soloteam] rough session? (${reasons}). Save the lesson while it's fresh:\n` +
      `  soloteam learn "What I fixed" --body "what broke, what worked"\n` +
      `  soloteam session save --note "one-line summary"   # feeds your weekly digest`,
  );
}
