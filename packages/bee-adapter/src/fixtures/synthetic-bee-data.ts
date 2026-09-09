import type {
  BeeConversation,
  BeeConversationDetailResponse,
  BeeFact,
  BeeTodo,
} from "../raw-types.js";

/**
 * Entirely synthetic fixtures shaped like `@beeai/cli/lib` responses, for
 * tests only. No real Bee transcripts, facts, todos, names, IDs,
 * addresses, or account information — every value here is invented for
 * this repository. Names follow the "Speaker A / Speaker B" and
 * "123 Fictional Avenue, Sampletown" convention used throughout this repo
 * so no fixture could ever be mistaken for real captured data.
 */

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const syntheticConversation: BeeConversation = {
  id: "conv_synthetic_001",
  start_time: "2026-01-05T09:00:00.000Z",
  end_time: "2026-01-05T09:12:00.000Z",
  device_type: "ios",
  state: "processed",
  created_at: "2026-01-05T09:12:05.000Z",
  updated_at: "2026-01-05T09:12:05.000Z",
  short_summary: "Planning a team offsite and dividing prep tasks.",
  summary:
    "Two colleagues discussed logistics for an upcoming team offsite, including venue " +
    "options, catering, and who would follow up with the venue by Friday.",
  primary_location: {
    address: "123 Fictional Avenue, Sampletown",
    latitude: 37.001,
    longitude: -122.001,
  },
  transcriptions: [
    {
      id: "transcription_synthetic_001",
      realtime: false,
      utterances: [
        {
          id: "utt_synthetic_001",
          realtime: false,
          start: "2026-01-05T09:00:10.000Z",
          end: "2026-01-05T09:00:15.000Z",
          spoken_at: "2026-01-05T09:00:15.000Z",
          text: "I think we should confirm the venue by Friday.",
          speaker: "Speaker A",
          created_at: "2026-01-05T09:00:16.000Z",
        },
        {
          id: "utt_synthetic_002",
          realtime: false,
          start: "2026-01-05T09:00:40.000Z",
          end: "2026-01-05T09:00:42.000Z",
          spoken_at: "2026-01-05T09:00:42.000Z",
          text: "Agreed, I will call them tomorrow morning.",
          speaker: "Speaker B",
          created_at: "2026-01-05T09:00:43.000Z",
        },
      ],
    },
    {
      id: "transcription_synthetic_002",
      realtime: false,
      utterances: [
        {
          id: "utt_synthetic_003",
          realtime: false,
          // No spoken_at here on purpose: exercises the `start` fallback.
          start: "2026-01-05T09:05:00.000Z",
          end: "2026-01-05T09:05:03.000Z",
          text: "Let's also check catering options.",
          speaker: "Speaker A",
          created_at: "2026-01-05T09:05:04.000Z",
        },
      ],
    },
  ],
};

/** Response shape for `bee.api.conversations.list()`: a wrapper object with a cursor. */
export const syntheticConversationListResponse = {
  conversations: [syntheticConversation],
  next_cursor: "cursor_synthetic_conversations_002",
};

/** Response shape for `bee.api.conversations.get(id)`: wrapped under a "conversation" key. */
export const syntheticConversationDetailResponse: BeeConversationDetailResponse = {
  conversation: syntheticConversation,
};

/**
 * Bee's real `conversations.list()` response is summary-only — verified
 * against a live account during Phase 1A audit remediation (see
 * docs/FRICTION-LOG.md) to never include nested `transcriptions[]` at
 * all, only `conversations.get(id)` does. This mirrors that: the same
 * conversation as `syntheticConversation`, minus `transcriptions`, for
 * conversation-detail-hydration regression tests.
 */
export const syntheticConversationSummary: BeeConversation = {
  id: syntheticConversation.id,
  start_time: syntheticConversation.start_time,
  end_time: syntheticConversation.end_time,
  device_type: syntheticConversation.device_type,
  state: syntheticConversation.state,
  created_at: syntheticConversation.created_at,
  updated_at: syntheticConversation.updated_at,
  short_summary: syntheticConversation.short_summary,
  summary: syntheticConversation.summary,
  primary_location: syntheticConversation.primary_location,
};

export const syntheticConversationSummaryListResponse = {
  conversations: [syntheticConversationSummary],
  next_cursor: "cursor_synthetic_conversations_002",
};

export const syntheticConversationMissingFields: BeeConversation = {
  // No id, no summary, no timestamps, no transcriptions: exercises placeholder-id and warning paths.
};

export const syntheticConversationMalformedTranscriptions = {
  id: "conv_synthetic_malformed_001",
  short_summary: "A conversation with malformed nested transcription data.",
  // `transcriptions` is present but `utterances` is missing on one entry and
  // malformed (not an array) on another — both must degrade to zero
  // utterances for that entry rather than throwing.
  transcriptions: [{ id: "transcription_no_utterances" }, { id: "transcription_bad_utterances", utterances: "not-an-array" }],
} as unknown as BeeConversation;

export const syntheticEmptyConversationListResponse = {
  conversations: [],
  next_cursor: null,
};

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export const syntheticFact: BeeFact = {
  id: "fact_synthetic_001",
  text: "Prefers async written updates over live status meetings.",
  tags: ["work-style"],
  created_at: "2026-01-04T18:30:00.000Z",
  confirmed: true,
};

export const syntheticFactListResponse = {
  facts: [syntheticFact],
  next_cursor: "cursor_synthetic_facts_002",
};

export const syntheticEmptyFactListResponse = {
  facts: [],
  next_cursor: null,
};

/** A pending (unconfirmed) fact, using the current `confirmed: false` field. */
export const syntheticPendingFact: BeeFact = {
  id: "fact_synthetic_002",
  text: "May prefer mornings for focus work.",
  tags: [],
  created_at: "2026-01-04T19:00:00.000Z",
  confirmed: false,
};

/** Exercises the legacy confirmation_status fallback: no `confirmed` field present. */
export const syntheticFactLegacyFields: BeeFact = {
  id: "fact_synthetic_legacy_001",
  text: "Legacy-shaped fact record.",
  timestamp: "2026-01-03T10:00:00.000Z",
  confirmation_status: "confirmed",
};

export const syntheticFactMissingFields: BeeFact = {
  id: null,
  text: null,
};

export const syntheticFactMalformedStatus: BeeFact = {
  id: "fact_synthetic_malformed_001",
  text: "A fact with an unrecognized status field.",
  confirmation_status: "surprising",
};

// ---------------------------------------------------------------------------
// Todos
// ---------------------------------------------------------------------------

export const syntheticTodo: BeeTodo = {
  id: "todo_synthetic_001",
  text: "Follow up with the offsite venue about catering options.",
  created_at: "2026-01-05T09:12:10.000Z",
  alarm_at: "2026-01-09T15:00:00.000Z",
  completed: false,
};

export const syntheticTodoListResponse = {
  todos: [syntheticTodo],
  next_cursor: "cursor_synthetic_todos_002",
};

export const syntheticEmptyTodoListResponse = {
  todos: [],
  next_cursor: null,
};

export const syntheticCompletedTodo: BeeTodo = {
  id: "todo_synthetic_002",
  text: "Book the offsite venue.",
  created_at: "2026-01-02T09:00:00.000Z",
  alarm_at: null,
  completed: true,
};

/** Exercises the legacy created/alarm/completion_status fallbacks: no current fields present. */
export const syntheticTodoLegacyFields: BeeTodo = {
  id: "todo_synthetic_legacy_001",
  text: "Legacy-shaped todo record.",
  created: "2026-01-01T09:00:00.000Z",
  alarm: "2026-01-08T09:00:00.000Z",
  completion_status: "open",
};

export const syntheticTodoMissingFields: BeeTodo = {
  id: undefined,
  text: undefined,
};

export const syntheticTodoMalformedStatus: BeeTodo = {
  id: "todo_synthetic_malformed_001",
  text: "A todo with an unrecognized status field.",
  completion_status: "someday",
};
