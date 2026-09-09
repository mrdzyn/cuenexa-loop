import { describe, expect, it } from "vitest";
import { parseArgs } from "../args.js";

describe("parseArgs", () => {
  it("defaults to includeContent: false", () => {
    expect(parseArgs([])).toEqual({ includeContent: false });
  });

  it("recognizes --include-content", () => {
    expect(parseArgs(["--include-content"])).toEqual({ includeContent: true });
  });

  it("ignores unrelated arguments", () => {
    expect(parseArgs(["--verbose", "--include-content", "extra"])).toEqual({ includeContent: true });
  });
});
