import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const rendererDist = join(exampleRoot, "dist/renderer");
mkdirSync(rendererDist, { recursive: true });
copyFileSync(join(exampleRoot, "src/renderer/index.html"), join(rendererDist, "index.html"));
copyFileSync(join(exampleRoot, "src/renderer/styles.css"), join(rendererDist, "styles.css"));

const preloadJs = join(exampleRoot, "dist/preload/preload.js");
const preloadCjs = join(exampleRoot, "dist/preload/preload.cjs");
if (existsSync(preloadJs)) {
  renameSync(preloadJs, preloadCjs);
}
