const INTERRUPT_MARKER = "Request interrupted by user";
const CORRECTION_RE = /^\s*(no+[,.!]?|stop|don'?t|nope|wrong|undo|revert|not that|not like that)\b/i;

export interface FrictionSignals {
  interruptions: number;
  errors: number;
  corrections: number;
}

export interface FrictionWeights {
  interruption: number;
  error: number;
  correction: number;
}

interface ContentBlock {
  type?: string;
  text?: string;
  is_error?: boolean;
}

interface TranscriptLine {
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
}

function isContentBlock(value: unknown): value is ContentBlock {
  return typeof value === "object" && value !== null;
}

function textOf(content: string | ContentBlock[] | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(isContentBlock)
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
  }
  return "";
}

/** Parses a Claude Code transcript (JSONL) into friction signal counts. */
export function extractSignals(transcriptText: string): FrictionSignals {
  let interruptions = 0;
  let errors = 0;
  let corrections = 0;

  for (const raw of transcriptText.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;

    const { message } = parsed as TranscriptLine;
    const role = message?.role;
    const content = message?.content;
    const text = textOf(content);

    if (text.includes(INTERRUPT_MARKER)) interruptions++;

    if (role === "user" && Array.isArray(content)) {
      for (const block of content) {
        if (isContentBlock(block) && block.type === "tool_result" && block.is_error) {
          errors++;
        }
      }
    }

    if (role === "user" && typeof content === "string" && CORRECTION_RE.test(content)) {
      corrections++;
    }
  }

  return { interruptions, errors, corrections };
}

export function scoreSignals(signals: FrictionSignals, weights: FrictionWeights): number {
  return (
    Math.min(signals.interruptions, 5) * weights.interruption +
    Math.min(signals.errors, 10) * weights.error +
    Math.min(signals.corrections, 5) * weights.correction
  );
}

/** Count tool_use blocks in a transcript — a rough session-size measure. */
export function countToolUses(transcriptText: string): number {
  let tools = 0;
  for (const raw of transcriptText.split("\n")) {
    const line = raw.trim();
    if (!line || !line.includes("tool_use")) continue;
    try {
      const parsed = JSON.parse(line) as TranscriptLine;
      const content = parsed.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (isContentBlock(block) && block.type === "tool_use") tools++;
        }
      }
    } catch {
      continue;
    }
  }
  return tools;
}
