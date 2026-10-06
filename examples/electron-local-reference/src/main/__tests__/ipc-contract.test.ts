import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, PRELOAD_API_METHODS } from "../../shared/ipc-contract.js";

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("IPC contract", () => {
  it("exposes only the approved P4-R1A channels and methods", () => {
    expect(Object.values(IPC_CHANNELS).sort()).toEqual([
      "cuenexa:get-review",
      "cuenexa:get-status",
      "cuenexa:sync",
    ]);
    expect([...PRELOAD_API_METHODS].sort()).toEqual(["getReview", "getStatus", "sync"]);
  });

  it("keeps the sandboxed preload on the same three invoke channels", () => {
    const preload = readFileSync(join(exampleRoot, "src/preload/preload.ts"), "utf8");
    expect(preload).toContain("cuenexa:get-status");
    expect(preload).toContain("cuenexa:sync");
    expect(preload).toContain("cuenexa:get-review");
    expect(preload).toContain("contextBridge.exposeInMainWorld(\"cuenexa\"");
    expect(preload).not.toContain("ipcRenderer.send");
    expect(preload).not.toContain("require(\"fs\")");
  });
});
