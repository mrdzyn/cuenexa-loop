import type { ConnectionStatusDto, CueNexaPreloadApi, ReviewSnapshotDto } from "../shared/ipc-contract.js";

declare global {
  interface Window {
    cuenexa: CueNexaPreloadApi;
  }
}

const beeState = document.querySelector("#bee-state");
const timezone = document.querySelector("#timezone");
const statusError = document.querySelector("#status-error");
const banner = document.querySelector("#banner");
const cards = document.querySelector("#cards");
const syncButton = document.querySelector("#sync-button");

function text(el: Element | null, value: string): void {
  if (el) el.textContent = value;
}

function setHidden(el: Element | null, hidden: boolean): void {
  el?.classList.toggle("hidden", hidden);
}

function renderStatus(status: ConnectionStatusDto): void {
  if (!status.beeAvailable) text(beeState, "unavailable");
  else if (!status.authenticated) text(beeState, "unauthenticated");
  else text(beeState, "authenticated");
  text(timezone, status.timeZone ?? "—");
  if (status.errorMessage) {
    text(statusError, status.errorMessage);
    setHidden(statusError, false);
  } else {
    setHidden(statusError, true);
  }
}

function renderReview(snapshot: ReviewSnapshotDto): void {
  const counts = snapshot.sections;
  text(document.querySelector("#count-dueNow"), String(counts.dueNow.length));
  text(document.querySelector("#count-needsAttention"), String(counts.needsAttention.length));
  text(document.querySelector("#count-waiting"), String(counts.waiting.length));
  text(document.querySelector("#count-snoozed"), String(counts.snoozed.length));
  text(document.querySelector("#count-recentlyResolved"), String(counts.recentlyResolved.length));

  const allCards = [
    ...counts.dueNow,
    ...counts.needsAttention,
    ...counts.waiting,
    ...counts.snoozed,
    ...counts.recentlyResolved,
  ];

  if (snapshot.errorMessage) {
    text(banner, snapshot.errorMessage);
    setHidden(banner, false);
  } else if (!snapshot.complete) {
    text(banner, "Historical snapshot is partial. Completeness is not claimed.");
    setHidden(banner, false);
  } else if (allCards.length === 0) {
    text(banner, "No loops in review.");
    setHidden(banner, false);
  } else {
    setHidden(banner, true);
  }

  if (!cards) return;
  cards.replaceChildren();
  for (const card of allCards) {
    const article = document.createElement("article");
    article.className = "card";
    const title = document.createElement("h2");
    title.textContent = card.title ?? "(untitled loop)";
    const state = document.createElement("p");
    state.textContent = card.state.toUpperCase();
    const members = document.createElement("p");
    members.textContent = `${card.memberCount} related conversations`;
    const section = document.createElement("p");
    const sectionLabel =
      card.section === "dueNow" ? "Due now" : card.section === "needsAttention" ? "Needs attention" : card.section;
    section.textContent = sectionLabel;
    article.append(title, state, members, section);
    cards.append(article);
  }
}

async function refreshStatus(): Promise<void> {
  renderStatus(await window.cuenexa.getStatus());
}

async function sync(): Promise<void> {
  if (syncButton instanceof HTMLButtonElement) syncButton.disabled = true;
  try {
    const snapshot = await window.cuenexa.sync();
    await refreshStatus();
    renderReview(snapshot);
  } finally {
    if (syncButton instanceof HTMLButtonElement) syncButton.disabled = false;
  }
}

syncButton?.addEventListener("click", () => {
  void sync();
});

void (async () => {
  await refreshStatus();
  renderReview(await window.cuenexa.getReview());
})();
