import type { ProvisionalSignal } from "@cuenexa-loop/loop-engine";
import { describe, expect, it } from "vitest";
import { renderProvisionalSignal } from "../provisional-presenter.js";

const signal: ProvisionalSignal = {
  id: "provisional_synthetic",
  type: "possible_commitment",
  observedAt: "2026-09-12T08:00:00.000Z",
  expiresAt: "2026-09-12T08:10:00.000Z",
  sessionId: null,
  conversationId: "conversation_synthetic",
  confidence: "strong",
  sourceEventIds: ["event_synthetic"],
  ephemeralText: `I will email alice@example.com at +1 555 123 4567 about ${"synthetic private details ".repeat(5)}`,
};

describe("renderProvisionalSignal", () => {
  it("renders only structural provisional status by default without reading text", () => {
    const guarded = { ...signal, get ephemeralText(): string { throw new Error("private text accessed"); } };
    const output = renderProvisionalSignal(guarded, false);
    expect(output).toContain("PROVISIONAL");
    expect(output).toContain("Content printed: NO");
    expect(output).toContain("Waiting for processed Bee history");
  });

  it("redacts before truncating the explicitly included ephemeral preview", () => {
    const output = renderProvisionalSignal(signal, true);
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("[redacted-number]");
    expect(output).not.toContain("alice@example.com");
    expect(output).not.toContain("+1 555 123 4567");
    expect(output.split("Preview: ")[1]?.split("\n")[0]?.length).toBeLessThanOrEqual(80);
  });
});
