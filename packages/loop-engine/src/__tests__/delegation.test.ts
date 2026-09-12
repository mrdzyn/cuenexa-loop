import { describe, expect, it } from "vitest";
import { detectDelegation } from "../detectors/delegation.js";
import { detectSentence } from "../detectors/index.js";

describe("detectDelegation", () => {
  it("detects direct-address delegation with 'can you'", () => {
    const match = detectDelegation("John, can you send the estimate?");
    expect(match?.type).toBe("delegation");
    expect(match?.owner).toEqual({ label: "John" });
  });

  it("detects direct-address delegation with 'please'", () => {
    const match = detectDelegation("Alex, please prepare the report by Friday.");
    expect(match?.owner).toEqual({ label: "Alex" });
  });

  it("keeps named 'check with' direct address as a delegation", () => {
    const match = detectSentence("John, can you check with the vendor?");
    expect(match?.type).toBe("delegation");
    expect(match?.owner).toEqual({ label: "John" });
  });

  it("keeps named 'follow up' direct address as a delegation", () => {
    const match = detectSentence("Alex, please follow up with the client tomorrow.");
    expect(match?.type).toBe("delegation");
    expect(match?.owner).toEqual({ label: "Alex" });
  });

  it("keeps first-person and bare-imperative follow-ups as follow-ups", () => {
    expect(detectSentence("I'll check with the vendor tomorrow.")?.type).toBe("follow_up");
    expect(detectSentence("Follow up with the vendor tomorrow.")?.type).toBe("follow_up");
  });

  it("detects third-person future assignment", () => {
    const match = detectDelegation("Sarah will prepare the report.");
    expect(match?.owner).toEqual({ label: "Sarah" });
  });

  it("detects a 'please have <team>' instruction", () => {
    const match = detectDelegation("Please have the operations team verify this.");
    expect(match?.owner).toEqual({ label: "the operations team" });
  });

  it("does not treat 'I will' as a delegation", () => {
    expect(detectDelegation("I will send the estimate tomorrow.")).toBeNull();
  });

  it("does not treat 'We will' as a delegation", () => {
    expect(detectDelegation("We will proceed with the plan.")).toBeNull();
  });

  it("does not match unrelated sentences", () => {
    expect(detectDelegation("The weather has been nice lately.")).toBeNull();
  });
});
