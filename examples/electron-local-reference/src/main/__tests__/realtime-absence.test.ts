import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (/\.(ts|mjs|js|json|html|css|md)$/.test(entry)) files.push(path);
  }
  return files;
}

describe("P4-R1A realtime prohibition", () => {
  it("does not include a realtime or CLI-deep-import path", () => {
    const files = collectSourceFiles(join(exampleRoot, "src")).filter((file) => !file.includes(`${join("src", "main", "__tests__")}`));
    files.push(join(exampleRoot, "package.json"));
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toMatch(/subscribeRealtime/);
    expect(combined).not.toMatch(/subscribeToBeeRealtime/);
    expect(combined).not.toMatch(/ProvisionalAwareness/);
    expect(combined).not.toMatch(/BeeConversationIdentityBridge/);
    expect(combined).not.toMatch(/@cuenexa-loop\/cli/);
    expect(combined).not.toMatch(/PROVISIONAL/);
  });
});
