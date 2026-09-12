import type { BeeConversation, BeeConversationDetailResponse } from "@cuenexa-loop/bee-adapter";
import { BeeAdapterClient, fetchDetectionSnapshot } from "@cuenexa-loop/bee-adapter";
import { detectLoopItems } from "@cuenexa-loop/loop-engine";
import { describe, expect, it, vi } from "vitest";
import { resolveTimeZone } from "../timezone.js";

/**
 * Derived from `BeeAdapterClient`'s own constructor signature rather than
 * importing `@beeai/cli/lib` directly here — only `@cuenexa-loop/bee-adapter`
 * is supposed to know Bee's official client shape (see docs/ARCHITECTURE.md);
 * this keeps that boundary even in a test fake.
 */
type FakeOfficialBeeClient = NonNullable<ConstructorParameters<typeof BeeAdapterClient>[0]>["client"];

/**
 * The audit-remediation-required orchestration test: with a fake Bee
 * client, `conversations.list()` returns a Bee-realistic *summary-only*
 * conversation (no nested transcriptions — this is what Bee's real list
 * endpoint returns), `conversations.get(id)` returns the same
 * conversation hydrated with a real commitment-shaped utterance, and the
 * full `fetchDetectionSnapshot` -> `detectLoopItems` pipeline — exactly
 * what `loops-check.ts` runs — must actually detect that commitment. This
 * deliberately exercises the real orchestration path (bee-adapter's
 * hydration wired into loop-engine's detection), not loop-engine in
 * isolation with hand-built `LoopConversation` fixtures.
 */
describe("loops:check orchestration: list-summary -> hydrated detail -> detection", () => {
  it("detects a commitment from an utterance that only exists in the hydrated conversation detail", async () => {
    const conversationId = "conv_synthetic_orchestration_001";

    const summaryOnly: BeeConversation = {
      id: conversationId,
      start_time: "2026-01-05T09:00:00.000Z",
      end_time: "2026-01-05T09:12:00.000Z",
      device_type: "ios",
      short_summary: "Planning next steps.",
      // No `transcriptions` field at all — matches Bee's real list-endpoint shape.
    };

    const hydratedDetail: BeeConversationDetailResponse = {
      conversation: {
        ...summaryOnly,
        transcriptions: [
          {
            id: "transcription_synthetic_orchestration_001",
            realtime: false,
            utterances: [
              {
                id: "utt_synthetic_orchestration_001",
                speaker: "Speaker A",
                text: "I'll send the revised proposal tomorrow.",
                spoken_at: "2026-01-05T09:00:15.000Z",
              },
            ],
          },
        ],
      },
    };

    const fakeBeeClient = {
      auth: { getProfile: vi.fn().mockResolvedValue({ id: "profile_synthetic" }), isAuthenticated: vi.fn(), login: vi.fn(), logout: vi.fn() },
      api: {
        me: vi.fn(),
        today: vi.fn(),
        now: vi.fn(),
        changed: vi.fn(),
        version: vi.fn(),
        facts: { list: vi.fn().mockResolvedValue({ facts: [] }), get: vi.fn(), create: vi.fn(), update: vi.fn(), confirm: vi.fn(), delete: vi.fn() },
        todos: { list: vi.fn().mockResolvedValue({ todos: [] }), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        conversations: {
          list: vi.fn().mockResolvedValue({ conversations: [summaryOnly], next_cursor: null }),
          get: vi.fn().mockResolvedValue(hydratedDetail),
        },
        daily: { list: vi.fn(), get: vi.fn() },
        journals: { list: vi.fn(), get: vi.fn() },
        search: vi.fn(),
      },
      sse: { streamJson: vi.fn() },
      run: vi.fn(),
      runJson: vi.fn(),
    } as unknown as FakeOfficialBeeClient;

    const client = new BeeAdapterClient({ client: fakeBeeClient });

    const { timeZone: beeTimeZone } = await client.ensureAuthenticated();
    const snapshot = await fetchDetectionSnapshot(client);

    // Confirm the orchestration actually hydrated (list summary alone would have zero utterances).
    expect(snapshot.conversations[0]?.utterances.length).toBeGreaterThan(0);

    const result = detectLoopItems({
      conversations: snapshot.conversations,
      facts: snapshot.facts,
      todos: snapshot.todos,
      now: "2026-01-05T09:15:00.000Z",
      timeZone: resolveTimeZone(beeTimeZone, {}),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("commitment");
    expect(result.items[0]?.source.conversationId).toBe(conversationId);
  });
});
