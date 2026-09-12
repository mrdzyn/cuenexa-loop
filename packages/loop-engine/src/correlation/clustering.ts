export interface CompleteLinkEdge {
  readonly first: number;
  readonly second: number;
  readonly confidence: number;
}

interface MergeCandidate {
  readonly firstClusterIndex: number;
  readonly secondClusterIndex: number;
  readonly members: readonly number[];
  readonly weakestLinkConfidence: number;
  readonly stableKey: string;
}

/**
 * Deterministic complete-link clustering. At every step, choose the valid
 * prospective merge with the strongest weakest required pair relationship.
 */
export function selectCompleteLinkClusters(
  memberIdentities: readonly string[],
  acceptedEdges: readonly CompleteLinkEdge[],
): number[][] {
  const edgeMap = new Map(acceptedEdges.map((edge) => [pairKey(edge.first, edge.second), edge]));
  const clusters = memberIdentities.map((_identity, index) => [index]);

  while (true) {
    const candidates: MergeCandidate[] = [];
    for (let first = 0; first < clusters.length - 1; first += 1) {
      for (let second = first + 1; second < clusters.length; second += 1) {
        const firstCluster = clusters[first];
        const secondCluster = clusters[second];
        if (!firstCluster || !secondCluster) {
          continue;
        }
        const merge = completeLinkMerge(first, second, firstCluster, secondCluster, memberIdentities, edgeMap);
        if (merge) {
          candidates.push(merge);
        }
      }
    }
    candidates.sort(
      (a, b) =>
        b.weakestLinkConfidence - a.weakestLinkConfidence ||
        a.stableKey.localeCompare(b.stableKey),
    );
    const best = candidates[0];
    if (!best) {
      break;
    }
    clusters.splice(best.secondClusterIndex, 1);
    clusters.splice(best.firstClusterIndex, 1, [...best.members]);
  }

  return clusters.sort((a, b) => stableClusterKey(a, memberIdentities).localeCompare(stableClusterKey(b, memberIdentities)));
}

function completeLinkMerge(
  firstClusterIndex: number,
  secondClusterIndex: number,
  firstCluster: readonly number[],
  secondCluster: readonly number[],
  memberIdentities: readonly string[],
  edgeMap: ReadonlyMap<string, CompleteLinkEdge>,
): MergeCandidate | null {
  const members = [...firstCluster, ...secondCluster].sort((a, b) => a - b);
  const scores: number[] = [];
  for (let first = 0; first < members.length - 1; first += 1) {
    for (let second = first + 1; second < members.length; second += 1) {
      const firstMember = members[first];
      const secondMember = members[second];
      if (firstMember === undefined || secondMember === undefined) {
        return null;
      }
      const edge = edgeMap.get(pairKey(firstMember, secondMember));
      if (!edge) {
        return null;
      }
      scores.push(edge.confidence);
    }
  }
  return {
    firstClusterIndex,
    secondClusterIndex,
    members,
    weakestLinkConfidence: Math.min(...scores),
    stableKey: stableClusterKey(members, memberIdentities),
  };
}

function stableClusterKey(cluster: readonly number[], memberIdentities: readonly string[]): string {
  return cluster
    .map((index) => memberIdentities[index] ?? "")
    .sort()
    .join(":");
}

function pairKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}
