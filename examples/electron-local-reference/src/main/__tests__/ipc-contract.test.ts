import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, IPC_INVOKE_CHANNELS, PRELOAD_API_METHODS } from "../../shared/ipc-contract.js";

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("IPC contract", () => {
  it("exposes only the approved P4-R1A and P4-R1B channels and methods", () => {
    expect([...IPC_INVOKE_CHANNELS].sort()).toEqual([
      "cuenexa:get-provisional",
      "cuenexa:get-review",
      "cuenexa:get-status",
      "cuenexa:start-realtime",
      "cuenexa:stop-realtime",
      "cuenexa:sync",
    ]);
    expect(IPC_CHANNELS.provisionalUpdated).toBe("cuenexa:provisional-updated");
    expect([...PRELOAD_API_METHODS].sort()).toEqual([
      "getProvisional",
      "getReview",
      "getStatus",
      "onProvisionalUpdate",
      "startRealtime",
      "stopRealtime",
      "sync",
    ]);
  });

  it("keeps the sandboxed preload on the allowlisted invoke/event channels", () => {
    const preload = readFileSync(join(exampleRoot, "src/preload/preload.ts"), "utf8");
    expect(preload).toContain("cuenexa:get-status");
    expect(preload).toContain("cuenexa:sync");
    expect(preload).toContain("cuenexa:get-review");
    expect(preload).toContain("cuenexa:start-realtime");
    expect(preload).toContain("cuenexa:stop-realtime");
    expect(preload).toContain("cuenexa:get-provisional");
    expect(preload).toContain("cuenexa:provisional-updated");
    expect(preload).toContain("contextBridge.exposeInMainWorld(\"cuenexa\"");
    expect(preload).not.toContain("ipcRenderer.send");
    expect(preload).not.toContain("require(\"fs\")");
  });
});
