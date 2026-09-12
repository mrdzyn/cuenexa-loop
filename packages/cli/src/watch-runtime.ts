import type { BeeRealtimeSubscription } from "@cuenexa-loop/bee-adapter";
import type { EphemeralRealtimeEvent } from "@cuenexa-loop/contracts";
import { ProvisionalAwareness } from "@cuenexa-loop/loop-engine";
import type { NotificationPlan, ReviewModel } from "@cuenexa-loop/loop-store";
import type { AuthoritativeSyncResult } from "./persistent-orchestration.js";
import { RealtimeHandoffCoordinator } from "./realtime-orchestration.js";
import { renderNotifications } from "./notification-presenter.js";
import { renderSyncReport } from "./persistent-presenter.js";
import { renderProvisionalSignal } from "./provisional-presenter.js";
import { renderReview } from "./review-presenter.js";

export const WATCH_TICK_MS = 1_000;
export const WATCH_RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000] as const;

export interface WatchRuntimeDependencies {
  readonly initialSync: (now: string) => Promise<AuthoritativeSyncResult>;
  readonly authoritativeRefresh: (now: string) => Promise<AuthoritativeSyncResult>;
  readonly subscribe: (signal: AbortSignal) => BeeRealtimeSubscription;
  readonly loadReview: (now: string) => ReviewModel;
  readonly loadNotifications: (now: string) => NotificationPlan;
  readonly output: (text: string) => void;
  readonly now?: () => string;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  /** Consumes a foreground user request (for example `r` + Enter). */
  readonly consumeManualRefreshRequest?: () => boolean;
  readonly includeContent?: boolean;
}

export interface WatchRuntimeResult {
  readonly subscriptionsOpened: number;
  readonly reconnectsAttempted: number;
  readonly authoritativeRefreshes: number;
}

/** Foreground-only ambient runtime. No timer or subscription survives run(). */
export async function runAmbientWatch(
  dependencies: WatchRuntimeDependencies,
  signal: AbortSignal,
): Promise<WatchRuntimeResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const wait = dependencies.wait ?? waitFor;
  const includeContent = dependencies.includeContent ?? false;
  const initialAt = now();
  const initial = await dependencies.initialSync(initialAt);
  const coordinator = new RealtimeHandoffCoordinator(
    new ProvisionalAwareness(), dependencies.authoritativeRefresh, initialAt,
  );
  let subscriptionsOpened = 0;
  let reconnectsAttempted = 0;
  let authoritativeRefreshes = 0;

  dependencies.output(renderSyncReport(initial.reconcile));
  dependencies.output(renderReview(dependencies.loadReview(now()), includeContent));
  dependencies.output("Authoritative CueNexa state is ready. Connecting realtime awareness… (press r then Enter to refresh)");

  for (let attempt = 0; !signal.aborted && attempt <= WATCH_RECONNECT_BACKOFF_MS.length; attempt += 1) {
    let subscription: BeeRealtimeSubscription | null = null;
    let subscriptionClosed = false;
    const attemptController = new AbortController();
    const cancelAttempt = () => attemptController.abort();
    signal.addEventListener("abort", cancelAttempt, { once: true });
    const closeSubscription = () => {
      if (subscriptionClosed) return;
      subscriptionClosed = true;
      attemptController.abort();
      try {
        subscription?.close();
      } catch {
        // Cancellation is best-effort and never exposes transport details.
      }
    };
    try {
      subscription = dependencies.subscribe(attemptController.signal);
      subscriptionsOpened += 1;
      dependencies.output("CueNexa Loop realtime watch ready (foreground). Provisional awareness is not persisted.");
      const eventTask = consumeRealtimeEvents(
        subscription.events, coordinator, dependencies, includeContent, initial.timeZone,
        attemptController.signal, now, (count) => { authoritativeRefreshes += count; },
      );
      const controlTask = runPeriodicControls(
        coordinator, dependencies, includeContent, attemptController.signal, wait, now,
        (count) => { authoritativeRefreshes += count; },
      );
      const outcome = await firstTaskOutcome(eventTask, controlTask);
      closeSubscription();
      await Promise.allSettled([eventTask, controlTask]);
      if (outcome.status === "rejected") throw outcome.reason;
    } catch {
      if (!signal.aborted) dependencies.output("Realtime unavailable — authoritative CueNexa state remains available.");
    } finally {
      closeSubscription();
      signal.removeEventListener("abort", cancelAttempt);
    }

    if (signal.aborted || attempt === WATCH_RECONNECT_BACKOFF_MS.length) break;

    authoritativeRefreshes += await refreshAndRender(
      coordinator, "realtime_gap", dependencies, includeContent, now(),
    );
    dependencies.output("Realtime unavailable — authoritative CueNexa state remains available.");
    reconnectsAttempted += 1;
    await wait(WATCH_RECONNECT_BACKOFF_MS[attempt]!, signal);
  }

  if (!signal.aborted) {
    const pendingDelay = coordinator.pendingRefreshDelayMs(now());
    if (pendingDelay !== null) {
      await wait(pendingDelay, signal);
      if (!signal.aborted) {
        authoritativeRefreshes += await flushPendingAndRender(
          coordinator, dependencies, includeContent, now(),
        );
      }
    }
  }

  return { subscriptionsOpened, reconnectsAttempted, authoritativeRefreshes };
}

async function consumeRealtimeEvents(
  events: AsyncIterable<EphemeralRealtimeEvent>,
  coordinator: RealtimeHandoffCoordinator,
  dependencies: WatchRuntimeDependencies,
  includeContent: boolean,
  timeZone: string,
  signal: AbortSignal,
  now: () => string,
  recordRefreshes: (count: number) => void,
): Promise<void> {
  for await (const event of events) {
    if (signal.aborted) break;
    const observed = coordinator.observe(event, timeZone);
    for (const provisional of observed.emitted) {
      dependencies.output(renderProvisionalSignal(provisional, includeContent));
    }
    if (event.kind === "conversation_state" && event.state === "processed") {
      recordRefreshes(await refreshAndRender(
        coordinator, "conversation_processed", dependencies, includeContent, now(),
      ));
    }
    if (signal.aborted) break;
  }
}

async function runPeriodicControls(
  coordinator: RealtimeHandoffCoordinator,
  dependencies: WatchRuntimeDependencies,
  includeContent: boolean,
  signal: AbortSignal,
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  now: () => string,
  recordRefreshes: (count: number) => void,
): Promise<void> {
  while (!signal.aborted) {
    await wait(WATCH_TICK_MS, signal);
    if (signal.aborted) break;
    const current = now();
    coordinator.expire(current);
    if (dependencies.consumeManualRefreshRequest?.()) {
      recordRefreshes(await refreshAndRender(coordinator, "manual", dependencies, includeContent, current));
    } else if (coordinator.pendingRefreshDue(current)) {
      recordRefreshes(await flushPendingAndRender(coordinator, dependencies, includeContent, current));
    } else if (coordinator.idleRefreshDue(current)) {
      recordRefreshes(await refreshAndRender(coordinator, "idle", dependencies, includeContent, current));
    }
  }
}

async function firstTaskOutcome(
  eventTask: Promise<void>,
  controlTask: Promise<void>,
): Promise<PromiseSettledResult<void>> {
  return Promise.race([
    eventTask.then(
      () => ({ status: "fulfilled", value: undefined }) as const,
      (reason: unknown) => ({ status: "rejected", reason }) as const,
    ),
    controlTask.then(
      () => ({ status: "fulfilled", value: undefined }) as const,
      (reason: unknown) => ({ status: "rejected", reason }) as const,
    ),
  ]);
}

async function refreshAndRender(
  coordinator: RealtimeHandoffCoordinator,
  trigger: Parameters<RealtimeHandoffCoordinator["refresh"]>[0],
  dependencies: WatchRuntimeDependencies,
  includeContent: boolean,
  now: string,
): Promise<number> {
  try {
    const refreshed = await coordinator.refresh(trigger, now);
    renderAuthoritativeUpdate(dependencies, refreshed.result, includeContent, now);
    return refreshed.attempted ? 1 : 0;
  } catch {
    dependencies.output("Authoritative refresh unavailable — existing persistent state remains available.");
    return 0;
  }
}

async function flushPendingAndRender(
  coordinator: RealtimeHandoffCoordinator,
  dependencies: WatchRuntimeDependencies,
  includeContent: boolean,
  now: string,
): Promise<number> {
  try {
    const refreshed = await coordinator.flushPending(now);
    renderAuthoritativeUpdate(dependencies, refreshed.result, includeContent, now);
    return refreshed.attempted ? 1 : 0;
  } catch {
    dependencies.output("Authoritative refresh unavailable — existing persistent state remains available.");
    return 0;
  }
}

function renderAuthoritativeUpdate(
  dependencies: WatchRuntimeDependencies,
  result: AuthoritativeSyncResult | null,
  includeContent: boolean,
  now: string,
): void {
  if (!result || result.reconcile.events.length === 0) return;
  dependencies.output([
    "AUTHORITATIVE — processed Bee history changed persistent CueNexa state.",
    renderSyncReport(result.reconcile),
  ].join("\n"));
  dependencies.output(renderReview(dependencies.loadReview(now), includeContent));
  // Display eligibility only. Merely watching never writes a delivery-ledger row.
  dependencies.output(renderNotifications(dependencies.loadNotifications(now), includeContent));
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
