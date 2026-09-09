import { describe, expect, it } from "vitest";
import { splitSentences } from "../text-utils.js";

describe("splitSentences", () => {
  it("splits on a period followed by whitespace", () => {
    expect(splitSentences("Just chatting. I'll send it tomorrow.")).toEqual([
      "Just chatting.",
      "I'll send it tomorrow.",
    ]);
  });

  it("does not split on a period inside an email address or domain", () => {
    // Regression guard: a naive `.`-boundary splitter breaks
    // "jordan@example.com" into "jordan@example" + "com", which then
    // fails to match the email-redaction pattern downstream in the CLI
    // presenter — silently defeating redaction. See docs/LOOP-DETECTION.md.
    const sentences = splitSentences("I'll send it to jordan@example.com tomorrow.");
    expect(sentences).toEqual(["I'll send it to jordan@example.com tomorrow."]);
  });

  it("handles a sentence with no terminal punctuation", () => {
    expect(splitSentences("just chatting")).toEqual(["just chatting"]);
  });

  it("returns an empty array for empty input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("splits multiple sentences within one utterance", () => {
    expect(splitSentences("I'll send it tomorrow. Who owns the deployment? Great, thanks.")).toEqual([
      "I'll send it tomorrow.",
      "Who owns the deployment?",
      "Great, thanks.",
    ]);
  });
});
