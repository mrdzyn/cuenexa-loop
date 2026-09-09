import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

// Alias workspace packages to their TS source so tests run against live
// code without requiring a build step first — important for a Phase 0
// foundation people will iterate on quickly.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
  },
  resolve: {
    alias: [
      { find: "@cuenexa-loop/contracts", replacement: resolvePath("./packages/contracts/src/index.ts") },
      { find: "@cuenexa-loop/bee-adapter", replacement: resolvePath("./packages/bee-adapter/src/index.ts") },
      { find: "@cuenexa-loop/loop-engine", replacement: resolvePath("./packages/loop-engine/src/index.ts") },
    ],
  },
});
