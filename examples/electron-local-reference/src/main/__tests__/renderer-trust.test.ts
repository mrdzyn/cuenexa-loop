import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../../shared/ipc-contract.js";
import {
  isTrustedIpcSender,
  isTrustedRendererNavigation,
  resolveTrustedRendererUrl,
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
  });

  it("keeps the IPC channel list at exactly three approved channels", () => {
    expect(Object.values(IPC_CHANNELS)).toEqual([
      "cuenexa:get-status",
      "cuenexa:sync",
      "cuenexa:get-review",
    ]);
  });

  it("does not open external links from the reference window", () => {
    const main = readFileSync(join(exampleRoot, "src/main/main.ts"), "utf8");
    expect(main).not.toContain("openExternal");
    expect(main).not.toMatch(/url\.startsWith\("file:"\)/);
  });
});
