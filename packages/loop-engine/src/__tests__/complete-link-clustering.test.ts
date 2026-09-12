import { describe, expect, it } from "vitest";
import { selectCompleteLinkClusters } from "../correlation/clustering.js";

describe("selectCompleteLinkClusters", () => {
  it("prefers the competing complete-link group with the stronger weakest link", () => {
    const clusters = selectCompleteLinkClusters(["member-a", "member-b", "member-c", "member-d"], [
      { first: 0, second: 1, confidence: 0.99 },
      { first: 0, second: 2, confidence: 0.98 },
      { first: 0, second: 3, confidence: 0.97 },
      { first: 1, second: 2, confidence: 0.91 },
      { first: 1, second: 3, confidence: 0.95 },
    ]);

    expect(clusters).toEqual([[0, 1, 3], [2]]);
  });

  it("uses stable member identities to break equal weakest-link ties", () => {
    const clusters = selectCompleteLinkClusters(["member-a", "member-b", "member-c"], [
      { first: 0, second: 1, confidence: 0.95 },
      { first: 0, second: 2, confidence: 0.95 },
    ]);

    expect(clusters).toEqual([[0, 1], [2]]);
  });
});
