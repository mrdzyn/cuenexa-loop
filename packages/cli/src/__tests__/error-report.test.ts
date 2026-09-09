import { BeeAuthenticationError, BeeCliUnavailableError, BeeCommandError, BeeMalformedResponseError } from "@cuenexa-loop/bee-adapter";
import { describe, expect, it } from "vitest";
import { renderBeeError } from "../error-report.js";

describe("renderBeeError", () => {
  it("tells the user to install Bee CLI for BeeCliUnavailableError", () => {
    const message = renderBeeError(new BeeCliUnavailableError("Bee CLI not found while listing facts."));
    expect(message).toContain("Bee CLI is installed");
  });

  it("tells the user to run bee login for BeeAuthenticationError", () => {
    const message = renderBeeError(new BeeAuthenticationError("Bee CLI reported no authenticated session."));
    expect(message).toContain("bee login");
  });

  it("gives actionable guidance for BeeCommandError", () => {
    const message = renderBeeError(new BeeCommandError("Bee CLI command failed while listing todos."));
    expect(message).toContain("bee status");
  });

  it("gives actionable guidance for BeeMalformedResponseError", () => {
    const message = renderBeeError(new BeeMalformedResponseError("Bee CLI returned malformed JSON while listing facts."));
    expect(message).toContain("@beeai/cli");
  });

  it("never leaks the underlying error message, which could contain Bee CLI stderr text", () => {
    const secret = "super-secret-internal-stderr-detail";
    const errors = [
      new BeeCliUnavailableError(secret),
      new BeeAuthenticationError(secret),
      new BeeCommandError(secret),
      new BeeMalformedResponseError(secret),
    ];

    for (const error of errors) {
      expect(renderBeeError(error)).not.toContain(secret);
    }
  });

  it("falls back to a generic message for an unrecognized error", () => {
    const message = renderBeeError(new Error("some other failure"));
    expect(message).not.toContain("some other failure");
    expect(message.length).toBeGreaterThan(0);
  });
});
