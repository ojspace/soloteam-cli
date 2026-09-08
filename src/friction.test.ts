import { describe, expect, test } from "bun:test";
import { countToolUses, extractSignals, scoreSignals } from "./friction";

const line = (message: unknown): string => JSON.stringify(message);

describe("extractSignals", () => {
  test("counts interruptions, tool errors, and corrections", () => {
    const transcript = [
      line({ message: { role: "assistant", content: [{ type: "text", text: "Request interrupted by user for tool use" }] } }),
      line({ message: { role: "user", content: [{ type: "tool_result", is_error: true }] } }),
      line({ message: { role: "user", content: [{ type: "tool_result", is_error: false }] } }),
      line({ message: { role: "user", content: "no, not like that — do it differently" } }),
      line({ message: { role: "user", content: "looks good, thanks" } }),
      "not-json {{{",
    ].join("\n");

    expect(extractSignals(transcript)).toEqual({ interruptions: 1, errors: 1, corrections: 1 });
  });

  test("empty transcript scores zero", () => {
    expect(extractSignals("")).toEqual({ interruptions: 0, errors: 0, corrections: 0 });
  });
});

describe("scoreSignals", () => {
  test("weights and caps runaway loops", () => {
    const weights = { interruption: 3, error: 1, correction: 2 };
    expect(scoreSignals({ interruptions: 1, errors: 1, corrections: 1 }, weights)).toBe(6);
    // caps: 5 interruptions, 10 errors, 5 corrections
    expect(scoreSignals({ interruptions: 99, errors: 99, corrections: 99 }, weights)).toBe(5 * 3 + 10 * 1 + 5 * 2);
  });
});

describe("countToolUses", () => {
  test("counts tool_use blocks only", () => {
    const transcript = [
      line({ message: { role: "assistant", content: [{ type: "tool_use", name: "Bash" }, { type: "text", text: "hi" }] } }),
      line({ message: { role: "assistant", content: [{ type: "text", text: "no tools here" }] } }),
    ].join("\n");
    expect(countToolUses(transcript)).toBe(1);
  });
});
