import type { BeeRealtimeSubscription } from "@cuenexa-loop/bee-adapter";
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
    try {
      subscription = dependencies.subscribe(signal);
      subscriptionsOpened += 1;
      dependencies.output("CueNexa Loop realtime watch ready (foreground). Provisional awareness is not persisted.");
      const iterator = subscription.events[Symbol.asyncIterator]();
      let pending = iterator.next();

      while (!signal.aborted) {
        const tickController = new AbortController();
        const cancelTick = () => tickController.abort();
        signal.addEventListener("abort", cancelTick, { once: true });
        const outcome = await Promise.race([
          pending.then((value) => ({ kind: "event" as const, value })),
          wait(WATCH_TICK_MS, tickController.signal).then(() => ({ kind: "tick" as const })),
        ]).finally(() => {
          tickController.abort();
          signal.removeEventListener("abort", cancelTick);
        });
        if (signal.aborted) break;
        if (outcome.kind === "tick") {
          const current = now();
          coordinator.expire(current);
          if (dependencies.consumeManualRefreshRequest?.()) {
            authoritativeRefreshes += await refreshAndRender(coordinator, "manual", dependencies, includeContent, current);
          } else if (coordinator.idleRefreshDue(current)) {
            authoritativeRefreshes += await refreshAndRender(coordinator, "idle", dependencies, includeContent, current);
          }
          continue;
        }
        if (outcome.value.done) break;
        pending = iterator.next();
        const event = outcome.value.value;
        const observed = coordinator.observe(event, initial.timeZone);
        for (const provisional of observed.emitted) {
          dependencies.output(renderProvisionalSignal(provisional, includeContent));
        }
        if (event.kind === "conversation_state" && event.state === "processed") {
          const current = now();
          authoritativeRefreshes += await refreshAndRender(
            coordinator, "conversation_processed", dependencies, includeContent, current,
          );
        }
      }
    } catch {
      if (!signal.aborted) dependencies.output("Realtime unavailable — authoritative CueNexa state remains available.");
    } finally {
      subscription?.close();
    }

    if (signal.aborted || attempt === WATCH_RECONNECT_BACKOFF_MS.length) break;

    authoritativeRefreshes += await refreshAndRender(
      coordinator, "realtime_gap", dependencies, includeContent, now(),
    );
    dependencies.output("Realtime unavailable — authoritative CueNexa state remains available.");
    reconnectsAttempted += 1;
    await wait(WATCH_RECONNECT_BACKOFF_MS[attempt]!, signal);
  }

  return { subscriptionsOpened, reconnectsAttempted, authoritativeRefreshes };
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
