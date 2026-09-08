import type { BeeConversation, BeeFact, BeeTodo } from "../raw-types.js";

/**
 * Entirely synthetic fixtures shaped like Bee proxy responses, for tests
 * only. No real Bee transcripts, facts, todos, names, or IDs — every value
 * here is invented for this repository.
 */

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
    address: "123 Fictional Ave, Sampletown",
    latitude: 37.001,
    longitude: -122.001,
  },
  transcriptions: [
    {
      speaker: "Speaker A",
      text: "I think we should confirm the venue by Friday.",
      timestamp: "2026-01-05T09:00:15.000Z",
    },
    {
      speaker: "Speaker B",
      text: "Agreed, I will call them tomorrow morning.",
      timestamp: "2026-01-05T09:00:42.000Z",
    },
  ],
};

export const syntheticConversationMissingFields: BeeConversation = {
  // No id, no summary, no timestamps: exercises placeholder-id and warning paths.
  transcriptions: [{ speaker: null, text: "Utterance with no other metadata.", timestamp: null }],
};

export const syntheticFact: BeeFact = {
  id: "fact_synthetic_001",
  text: "Prefers async written updates over live status meetings.",
  tags: ["work-style"],
  timestamp: "2026-01-04T18:30:00.000Z",
  confirmation_status: "confirmed",
};

export const syntheticFactMissingFields: BeeFact = {
  id: null,
  text: null,
  confirmation_status: "surprising",
};

export const syntheticTodo: BeeTodo = {
  id: "todo_synthetic_001",
  text: "Follow up with the offsite venue about catering options.",
  created: "2026-01-05T09:12:10.000Z",
  alarm_at: "2026-01-09T15:00:00.000Z",
  completion_status: "open",
};

export const syntheticTodoMissingFields: BeeTodo = {
  id: undefined,
  text: undefined,
  completion_status: "someday",
};
