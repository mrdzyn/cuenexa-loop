import { parseIsoInstant, type LoopStore, type UserStateMutationResult } from "@cuenexa-loop/loop-store";

export type ThreadAction = "ack" | "snooze" | "unsnooze" | "pin" | "unpin" | "dismiss" | "restore";

export interface ThreadActionRequest {
  readonly action: ThreadAction;
  readonly threadId: string;
  readonly snoozedUntil?: string;
}

export interface ThreadActionResult {
  readonly action: ThreadAction;
  readonly threadId: string;
  readonly changed: boolean;
  readonly snoozedUntil: string | null;
}

export class ThreadActionArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadActionArgumentError";
  }
}

const ACTIONS = new Set<ThreadAction>(["ack", "snooze", "unsnooze", "pin", "unpin", "dismiss", "restore"]);
const THREAD_ID_PATTERN = /^thread_[a-zA-Z0-9_-]{1,128}$/;
const DURATION_PATTERN = /^([1-9]\d*)([mhd])$/;
const MIN_SNOOZE_MS = 60_000;
const MAX_SNOOZE_MS = 365 * 24 * 60 * 60 * 1000;

export function parseThreadActionArgs(argv: readonly string[], now: string): ThreadActionRequest {
  const action = argv[0];
  if (!action || !ACTIONS.has(action as ThreadAction)) throw new ThreadActionArgumentError("Expected a supported local thread action.");
  const threadId = argv[1];
  if (!threadId || !THREAD_ID_PATTERN.test(threadId)) throw new ThreadActionArgumentError("Expected exactly one valid local thread ID.");
  const typedAction = action as ThreadAction;
  const rest = argv.slice(2);
  if (typedAction !== "snooze") {
    if (rest.length > 0) throw new ThreadActionArgumentError("This action does not accept additional arguments.");
    return { action: typedAction, threadId };
  }

  let until: string | undefined;
  let duration: string | undefined;
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value || (flag !== "--until" && flag !== "--for")) {
      throw new ThreadActionArgumentError("Snooze requires either --until <ISO timestamp> or --for <duration>.");
    }
    if (flag === "--until") {
      if (until) throw new ThreadActionArgumentError("Snooze option was provided more than once.");
      until = value;
    } else {
      if (duration) throw new ThreadActionArgumentError("Snooze option was provided more than once.");
      duration = value;
    }
  }
  if ((until && duration) || (!until && !duration)) {
    throw new ThreadActionArgumentError("Choose exactly one of --until or --for.");
  }
  return { action: "snooze", threadId, snoozedUntil: until ? validateAbsoluteSnooze(until, now) : resolveDuration(duration!, now) };
}

export function executeThreadAction(store: LoopStore, request: ThreadActionRequest, now: string): ThreadActionResult {
  let mutation: UserStateMutationResult;
  switch (request.action) {
    case "ack": mutation = store.acknowledgeThread(request.threadId, now); break;
    case "snooze": mutation = store.snoozeThread(request.threadId, request.snoozedUntil!, now); break;
    case "unsnooze": mutation = store.unsnoozeThread(request.threadId, now); break;
    case "pin": mutation = store.pinThread(request.threadId, now); break;
    case "unpin": mutation = store.unpinThread(request.threadId, now); break;
    case "dismiss": mutation = store.dismissThread(request.threadId, now); break;
    case "restore": mutation = store.restoreThread(request.threadId, now); break;
  }
  return { action: request.action, threadId: request.threadId, changed: mutation.changed, snoozedUntil: mutation.state.snoozedUntil };
}

export function renderThreadActionResult(result: ThreadActionResult): string {
  const status = result.changed ? "updated" : "unchanged";
  const snooze = result.action === "snooze" && result.snoozedUntil ? ` until ${result.snoozedUntil}` : "";
  return `Local thread ${result.threadId}: ${result.action}${snooze} (${status}). Source lifecycle unchanged.`;
}

function resolveDuration(value: string, now: string): string {
  const match = DURATION_PATTERN.exec(value);
  if (!match) throw new ThreadActionArgumentError("Relative snooze duration must use m, h, or d units.");
  const amount = Number(match[1]);
  const multiplier = match[2] === "m" ? 60_000 : match[2] === "h" ? 60 * 60_000 : 24 * 60 * 60_000;
  const durationMs = amount * multiplier;
  const nowMs = Date.parse(now);
  if (!Number.isSafeInteger(durationMs) || !Number.isFinite(nowMs) || durationMs < MIN_SNOOZE_MS || durationMs > MAX_SNOOZE_MS) {
    throw new ThreadActionArgumentError("Relative snooze duration must be between 1 minute and 365 days.");
  }
  return new Date(nowMs + durationMs).toISOString();
}

function validateAbsoluteSnooze(value: string, now: string): string {
  const untilMs = parseIsoInstant(value);
  const nowMs = Date.parse(now);
  if (untilMs === null) {
    throw new ThreadActionArgumentError("Absolute snooze time must be a valid ISO-8601 UTC timestamp.");
  }
  const duration = untilMs - nowMs;
  if (duration < MIN_SNOOZE_MS || duration > MAX_SNOOZE_MS) {
    throw new ThreadActionArgumentError("Absolute snooze time must be between 1 minute and 365 days in the future.");
  }
  return new Date(untilMs).toISOString();
}
