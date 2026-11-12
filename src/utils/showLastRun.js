// One-shot request from the chat: "show the run I just started, once it ends".
//
// A chat-started run opens the page of the step that was asked for. Pages that
// restore results only through a "Load last …" button (Plan C: nothing loads on
// an ordinary visit) take this request once on mount and treat it as a press
// of that button, so the user sees the run's result without another click.
//
// The chat makes the request as soon as the run starts, not when it ends: the
// asked page is hidden while its step is re-made, and the gate may bring it
// back before the chat notices the end. Its life covers the run's estimate
// plus a margin, it is keyed by page, and the chat clears it when the run
// stops, so it can never turn a later, ordinary visit into an automatic load.
const DEFAULT_TTL_MS = 30_000;
let pending = null; // { page, until }

export function requestShowLastRun(page, ttlMs = DEFAULT_TTL_MS) {
  pending = { page, until: Date.now() + Math.max(0, Number(ttlMs) || 0) };
}

// The run ended: a request no page has taken yet gets a fresh, short life, so
// a run that outlasted its estimate still opens on its result. A request a
// page already took is not made again.
export function renewShowLastRun(page, ttlMs = DEFAULT_TTL_MS) {
  if (pending && pending.page === page) requestShowLastRun(page, ttlMs);
}

export function clearShowLastRun() {
  pending = null;
}

export function takeShowLastRun(page) {
  const p = pending;
  if (!p || p.page !== page) return false;
  pending = null;
  return Date.now() <= p.until;
}
