import { describe, expect, it } from "vitest";
import { detectOpenQuestion } from "../detectors/open-question.js";

describe("detectOpenQuestion", () => {
  it("detects an explicit 'who' question", () => {
    expect(detectOpenQuestion("Who is going to own deployment?")?.type).toBe("open_question");
    expect(detectOpenQuestion("Who owns the deployment?")?.type).toBe("open_question");
  });

  it("detects a 'do we know' question", () => {
    expect(detectOpenQuestion("Do we know whether legal approved this?")).not.toBeNull();
  });

  it("detects a 'when' question", () => {
    expect(detectOpenQuestion("When are we sending the estimate?")).not.toBeNull();
  });

  it("does not classify a non-question as an open question", () => {
    expect(detectOpenQuestion("We are sending the estimate tomorrow.")).toBeNull();
  });

  it("does not classify a recognizable rhetorical tag question", () => {
    expect(detectOpenQuestion("That went well, right?")).toBeNull();
    expect(detectOpenQuestion("Great meeting, don't you think?")).toBeNull();
  });

  it("does not classify a recognizable negative-polarity rhetorical opener", () => {
    expect(detectOpenQuestion("Isn't that great?")).toBeNull();
    expect(detectOpenQuestion("Wasn't that a good call?")).toBeNull();
  });
});
