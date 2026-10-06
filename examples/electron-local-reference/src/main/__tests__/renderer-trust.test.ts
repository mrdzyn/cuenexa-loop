import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../../shared/ipc-contract.js";
import {
  UNTRUSTED_IPC_SENDER_MESSAGE,
  UntrustedIpcSenderError,
  isTrustedIpcSender,
  isTrustedRendererNavigation,
  resolveTrustedRendererUrl,
  withTrustedIpcSender,
} from "../renderer-trust.js";

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const trustedPath = join(exampleRoot, "dist/renderer/index.html");
const trustedUrl = resolveTrustedRendererUrl(trustedPath);

describe("renderer navigation trust", () => {
  it("allows only the bundled renderer URL", () => {
    expect(isTrustedRendererNavigation(trustedUrl, trustedUrl)).toBe(true);
    expect(isTrustedRendererNavigation(`${trustedUrl}#hash`, trustedUrl)).toBe(true);
  });

  it("does not treat arbitrary file: URLs as trusted", () => {
    expect(isTrustedRendererNavigation("file:///tmp/unrelated.html", trustedUrl)).toBe(false);
    expect(isTrustedRendererNavigation(pathToFileURL("/etc/passwd").href, trustedUrl)).toBe(false);
    expect(isTrustedRendererNavigation("https://example.invalid", trustedUrl)).toBe(false);
  });
});

describe("IPC sender trust", () => {
  it("allows the bundled renderer and rejects missing or unrelated senders", () => {
    expect(isTrustedIpcSender(trustedUrl, trustedUrl)).toBe(true);
    expect(isTrustedIpcSender(undefined, trustedUrl)).toBe(false);
    expect(isTrustedIpcSender("file:///tmp/spoof.html", trustedUrl)).toBe(false);
    expect(isTrustedIpcSender("https://example.invalid", trustedUrl)).toBe(false);
    expect(isTrustedIpcSender("http://127.0.0.1:3000", trustedUrl)).toBe(false);
  });

  it("rejects untrusted invocations without calling CueNexa service methods or returning review data", () => {
    const calls: string[] = [];
    const cachedReview = {
      complete: true,
      sections: {
        dueNow: [{ id: "thread_secret", title: "Secret Loop Title" }],
      },
    };
    const untrustedSenders = [undefined, "file:///tmp/spoof.html", "https://evil.example", "http://127.0.0.1:9"];
    for (const senderUrl of untrustedSenders) {
      expect(() =>
        withTrustedIpcSender(senderUrl, trustedUrl, () => {
          calls.push("getStatus");
          calls.push("sync");
          calls.push("getReview");
          return cachedReview;
        }),
      ).toThrow(UntrustedIpcSenderError);
    }
    expect(calls).toEqual([]);
    try {
      withTrustedIpcSender("file:///tmp/spoof.html", trustedUrl, () => cachedReview);
    } catch (error) {
      expect(error).toBeInstanceOf(UntrustedIpcSenderError);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe(UNTRUSTED_IPC_SENDER_MESSAGE);
      expect(message).not.toContain("thread_secret");
      expect(message).not.toContain("Secret Loop Title");
      expect(JSON.stringify(error)).not.toContain("thread_secret");
    }
  });

  it("invokes the handler only for the bundled renderer", () => {
    const result = withTrustedIpcSender(trustedUrl, trustedUrl, () => "trusted-ok");
    expect(result).toBe("trusted-ok");
  });

  it("keeps the IPC channel list allowlisted", () => {
    expect(Object.values(IPC_CHANNELS)).toEqual([
      "cuenexa:get-status",
      "cuenexa:sync",
      "cuenexa:get-review",
      "cuenexa:start-realtime",
      "cuenexa:stop-realtime",
      "cuenexa:get-provisional",
      "cuenexa:provisional-updated",
    ]);
  });

  it("does not open external links from the reference window", () => {
    const main = readFileSync(join(exampleRoot, "src/main/main.ts"), "utf8");
    expect(main).not.toContain("openExternal");
    expect(main).not.toMatch(/url\.startsWith\("file:"\)/);
  });

  it("does not build untrusted IPC responses from CueNexaService", () => {
    const ipc = readFileSync(join(exampleRoot, "src/main/ipc.ts"), "utf8");
    expect(ipc).toContain("withTrustedIpcSender");
    expect(ipc).not.toContain("untrustedReview");
    expect(ipc).not.toContain("untrustedStatus");
  });
});
