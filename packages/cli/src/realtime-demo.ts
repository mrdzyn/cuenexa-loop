import type { EphemeralRealtimeUtterance } from "@cuenexa-loop/contracts";
import { createStableLoopId, ProvisionalAwareness, type Loop, type LoopItem } from "@cuenexa-loop/loop-engine";
import { buildReviewModel, LoopStore, planNotifications } from "@cuenexa-loop/loop-store";
import { renderNotifications } from "./notification-presenter.js";
import { renderProvisionalSignal } from "./provisional-presenter.js";
import { renderReview } from "./review-presenter.js";

const DEMO_NOW = "2026-09-12T08:00:00.000Z";
const DEMO_REALTIME_UUID = "uuid-synthetic-demo";
const DEMO_HISTORICAL_ID = "6531525";

export interface SyntheticRealtimeDemoResult {
  readonly output: string;
  readonly threadsBeforeAuthoritativeHandoff: number;
  readonly threadsAfterAuthoritativeHandoff: number;
  readonly threadCreatedEvents: number;
  readonly notificationDeliveries: number;
}

/** Deterministic public-data-only demo. It never opens Bee or a disk database. */
export function runSyntheticRealtimeDemo(includeContent: boolean): SyntheticRealtimeDemoResult {
  const store = new LoopStore({ path: ":memory:" });
  try {
    const awareness = new ProvisionalAwareness();
    const provisional = awareness.ingest(syntheticRealtimeUtterance(), "UTC").emitted;
    const threadsBeforeAuthoritativeHandoff = store.listThreads().length;

    // This fixture represents output already produced by the authoritative Phase 1 path.
    // The realtime signal itself is never converted or passed to reconcile().
    const processedLoop = syntheticProcessedLoop();
    store.reconcile({ loops: [processedLoop], observedAt: DEMO_NOW, complete: true });
    store.reconcile({ loops: [processedLoop], observedAt: DEMO_NOW, complete: true });
    // This exact pair models the provider's explicit new-conversation id+uuid payload.
    awareness.resolveConversationIdentity(DEMO_REALTIME_UUID, DEMO_HISTORICAL_ID);
    awareness.retireConversations(new Set([DEMO_HISTORICAL_ID]));

    const threads = store.listThreads();
    const events = store.listEvents(500);
    const review = buildReviewModel(threads, events, store.listThreadUserStates(), DEMO_NOW);
    const notifications = planNotifications(threads, events, store.listThreadUserStates(), [], DEMO_NOW);
    const lines = [
      "CueNexa Loop — synthetic ambient realtime demo",
      "Synthetic fixture only; no live Bee data and no disk database.",
      "",
      "1. Conversation observation (non-authoritative)",
      ...provisional.map((signal) => renderProvisionalSignal(signal, includeContent)),
      `Persistent threads after realtime only: ${threadsBeforeAuthoritativeHandoff}`,
      "",
      "2. Simulated processed-history handoff (authoritative path fixture)",
      `Persistent threads after authoritative reconciliation and replay: ${threads.length}`,
      `Provisional signals remaining after confirmation: ${awareness.list().length}`,
      "",
      "3. Phase 3 follow-through",
      renderReview(review, includeContent),
      "",
      renderNotifications(notifications, includeContent),
      "Watch display recorded notification deliveries: 0",
    ];
    return {
      output: lines.join("\n"),
      threadsBeforeAuthoritativeHandoff,
      threadsAfterAuthoritativeHandoff: threads.length,
      threadCreatedEvents: events.filter((event) => event.type === "thread_created").length,
      notificationDeliveries: store.listNotificationDeliveries().length,
    };
  } finally {
    store.close();
  }
}

function syntheticRealtimeUtterance(): EphemeralRealtimeUtterance {
  return {
    kind: "utterance", id: "event_synthetic_realtime", provider: "bee", providerEventId: null,
    sessionId: DEMO_REALTIME_UUID, conversationId: null, utteranceId: "utterance_synthetic_realtime",
    observedAt: DEMO_NOW, spokenAt: null,
    text: "I will send the synthetic pricing deck to demo@example.com tomorrow.", final: true,
  };
}

function syntheticProcessedLoop(): Loop {
  const items = [processedItem("a"), processedItem("b")];
  return {
    id: createStableLoopId(items), title: "Send synthetic pricing deck to demo@example.com", state: "open",
    members: items.map((item) => ({ itemId: item.id, item })),
    timeline: items.map((item, sequence) => ({
      itemId: item.id, source: item.source, occurredAt: item.createdAt, timestampSource: "conversation_started", sequence,
    })),
    correlationLinks: [{
      fromItemId: items[0]!.id, toItemId: items[1]!.id, confidence: 0.95,
      reasonCodes: ["shared_specific_anchor_phrase"], sharedSpecificAnchorCount: 1,
    }],
    correlationConfidence: 0.95,
    snapshot: { observedAt: DEMO_NOW, completeness: "complete" }, resolvedAt: null,
  };
}

function processedItem(suffix: string): LoopItem {
  return {
    id: `item_synthetic_${suffix}`, type: "commitment", text: "Send synthetic pricing deck", state: "open",
    confidence: 0.95, owner: null, counterparties: [], dueAt: "2026-09-12T18:00:00.000Z", dueAtPhrase: "tomorrow",
    source: { provider: "test", conversationId: suffix === "a" ? DEMO_HISTORICAL_ID : "6531526", factId: null, todoId: null, utteranceIndexes: [0] },
    evidence: [{ type: "utterance", sourceId: suffix === "a" ? DEMO_HISTORICAL_ID : "6531526", text: "Synthetic evidence only" }],
    createdAt: DEMO_NOW, resolvedAt: null,
  };
}
