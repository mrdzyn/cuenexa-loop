import { createStableLoopId, createStableMemberIdentity } from "../loop-id.js";
import {
  LoopCorrelationInputSchema,
  LoopCorrelationLinkSchema,
  LoopCorrelationResultSchema,
  LoopSchema,
} from "../loop-types.js";
import type {
  Loop,
  LoopCorrelationInput,
  LoopCorrelationLink,
  LoopCorrelationResult,
  LoopCorrelationWarning,
} from "../loop-types.js";
import type { LoopItem } from "../types.js";
import { deriveItemOccurrence } from "./occurrence.js";
import { scoreCorrelationPair } from "./scoring.js";
import type { CorrelationScoreResult } from "./types.js";
import { buildLoopTimeline } from "./timeline.js";

interface CandidateMember {
  readonly item: LoopItem;
  readonly identity: string;
}

interface AcceptedEdge {
  readonly first: number;
  readonly second: number;
  readonly score: CorrelationScoreResult;
  readonly stableKey: string;
}

/** Pure, deterministic Phase 1B snapshot correlation. No state survives this call. */
export function correlateLoopItems(rawInput: LoopCorrelationInput): LoopCorrelationResult {
  const input = LoopCorrelationInputSchema.parse(rawInput);
  const candidates: CandidateMember[] = input.items
    .map((item) => ({ item, identity: createStableMemberIdentity(item) }))
    .sort((a, b) => a.identity.localeCompare(b.identity) || a.item.id.localeCompare(b.item.id));
  const acceptedEdges: AcceptedEdge[] = [];

  for (let first = 0; first < candidates.length - 1; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      const firstCandidate = candidates[first];
      const secondCandidate = candidates[second];
      if (!firstCandidate || !secondCandidate) {
        continue;
      }
      const score = scoreCorrelationPair(firstCandidate.item, secondCandidate.item, {
        conversations: input.conversations,
      });
      if (score.accepted) {
        acceptedEdges.push({
          first,
          second,
          score,
          stableKey: `${firstCandidate.identity}:${secondCandidate.identity}`,
        });
      }
    }
  }

  acceptedEdges.sort((a, b) => b.score.confidence - a.score.confidence || a.stableKey.localeCompare(b.stableKey));
  const edgeMap = new Map(acceptedEdges.map((edge) => [pairKey(edge.first, edge.second), edge]));
  const clusters = candidates.map((_candidate, index) => [index]);

  for (const edge of acceptedEdges) {
    const firstClusterIndex = clusters.findIndex((cluster) => cluster.includes(edge.first));
    const secondClusterIndex = clusters.findIndex((cluster) => cluster.includes(edge.second));
    if (firstClusterIndex < 0 || secondClusterIndex < 0 || firstClusterIndex === secondClusterIndex) {
      continue;
    }
    const firstCluster = clusters[firstClusterIndex];
    const secondCluster = clusters[secondClusterIndex];
    if (!firstCluster || !secondCluster || !allCrossPairsAccepted(firstCluster, secondCluster, edgeMap)) {
      continue;
    }
    const merged = [...firstCluster, ...secondCluster].sort((a, b) => a - b);
    const high = Math.max(firstClusterIndex, secondClusterIndex);
    const low = Math.min(firstClusterIndex, secondClusterIndex);
    clusters.splice(high, 1);
    clusters.splice(low, 1, merged);
  }

  const warnings: LoopCorrelationWarning[] = [];
  const loops = clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => buildLoop(cluster, candidates, edgeMap, input));
  loops.sort((a, b) => a.id.localeCompare(b.id));

  const hasUnavailableConversationContext = loops.some((loop) =>
    loop.members.some(
      (member) =>
        member.item.source.conversationId !== null &&
        deriveItemOccurrence(member.item, input.conversations).timestampSource === "unavailable",
    ),
  );
  if (hasUnavailableConversationContext) {
    warnings.push({
      field: "timeline",
      message: "One or more emitted members lacked normalized conversation timing context.",
    });
  }

  const snapshot = {
    ...input.snapshot,
    completeness: input.snapshot.completeness === "partial" || warnings.length > 0 ? "partial" as const : "complete" as const,
  };
  return LoopCorrelationResultSchema.parse({
    loops: loops.map((loop) => ({ ...loop, snapshot })),
    warnings,
    snapshot,
  });
}

function allCrossPairsAccepted(
  firstCluster: readonly number[],
  secondCluster: readonly number[],
  edgeMap: ReadonlyMap<string, AcceptedEdge>,
): boolean {
  return firstCluster.every((first) => secondCluster.every((second) => edgeMap.has(pairKey(first, second))));
}

function buildLoop(
  cluster: readonly number[],
  candidates: readonly CandidateMember[],
  edgeMap: ReadonlyMap<string, AcceptedEdge>,
  input: LoopCorrelationInput,
): Loop {
  const members = cluster
    .map((index) => candidates[index])
    .filter((candidate): candidate is CandidateMember => candidate !== undefined);
  const items = members.map((member) => member.item);
  const links: LoopCorrelationLink[] = [];

  for (let first = 0; first < cluster.length - 1; first += 1) {
    for (let second = first + 1; second < cluster.length; second += 1) {
      const firstIndex = cluster[first];
      const secondIndex = cluster[second];
      if (firstIndex === undefined || secondIndex === undefined) {
        continue;
      }
      const edge = edgeMap.get(pairKey(firstIndex, secondIndex));
      const firstMember = candidates[firstIndex];
      const secondMember = candidates[secondIndex];
      if (!edge || !firstMember || !secondMember) {
        continue;
      }
      links.push(LoopCorrelationLinkSchema.parse({
        fromItemId: firstMember.item.id,
        toItemId: secondMember.item.id,
        confidence: edge.score.confidence,
        reasonCodes: edge.score.reasonCodes,
        sharedSpecificAnchorCount: edge.score.sharedSpecificAnchorCount,
      }));
    }
  }
  links.sort((a, b) => a.fromItemId.localeCompare(b.fromItemId) || a.toItemId.localeCompare(b.toItemId));

  return LoopSchema.parse({
    id: createStableLoopId(items),
    title: null,
    state: "open",
    members: members.map(({ item }) => ({ itemId: item.id, item })),
    timeline: buildLoopTimeline(items, input.conversations),
    correlationLinks: links,
    correlationConfidence: Math.min(...links.map((link) => link.confidence)),
    snapshot: input.snapshot,
    resolvedAt: null,
  });
}

function pairKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}
