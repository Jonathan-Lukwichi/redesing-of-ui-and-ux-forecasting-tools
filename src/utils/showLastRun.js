// One-shot request from the chat: "show the run that just finished".
//
// When a chat-started run ends, the chat opens the page of the step that was
// asked for. Pages that restore results only through a "Load last …" button
// (Plan C: nothing loads on an ordinary visit) take this request once on mount
// and treat it as a press of that button, so the user sees the run's result
// without another click. It is keyed by page and expires quickly, so it can
// never turn a later, ordinary visit into an automatic load.
const TTL_MS = 30_000;
let pending = null; // { page, at }

export function requestShowLastRun(page) {
  pending = { page, at: Date.now() };
}

export function takeShowLastRun(page) {
  const p = pending;
  if (!p || p.page !== page) return false;
  pending = null;
  return Date.now() - p.at <= TTL_MS;
}
