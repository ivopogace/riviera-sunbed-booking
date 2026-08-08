/**
 * Render an ISO-8601 UTC instant (e.g. a request-response deadline) as a
 * human-readable wall-clock time in the riviera's civil zone. Times are reasoned about in
 * `Europe/Tirane` (invariant #6) — never the viewer's or the runtime's default zone — and the
 * locale is pinned like `shared/money.ts` so output is deterministic across environments.
 */
export function formatDeadline(iso: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Tirane',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** A request is "urgent" — the amber ⏰ chip shows — when its response deadline is under 8h away. */
const URGENT_WINDOW_MS = 8 * 60 * 60 * 1000;

/**
 * True when the response deadline (`deadlineIso`, a UTC instant) is under the {@link URGENT_WINDOW_MS}
 * urgency window from `nowMs` — drives the Requests-tab amber time-left chip. Pure:
 * the caller passes `now` (captured once at the component boundary, never an ambient `new Date()`), so
 * the boundary is deterministic in tests. A deadline already in the past is not "urgent" (the sweep owns
 * it) — the queue only ever lists still-pending requests.
 */
export function isUrgent(deadlineIso: string, nowMs: number): boolean {
  const remainingMs = new Date(deadlineIso).getTime() - nowMs;
  return remainingMs > 0 && remainingMs < URGENT_WINDOW_MS;
}

/**
 * A compact "time left until the deadline" label for the urgency chip, e.g. `"3h left"` or
 * `"45m left"` — hour-granularity once a full hour or more remains (the chip is a hint, not a live
 * countdown), minute-granularity below, floored at `"1m left"`. Both branches **floor** so the label
 * never overstates the time left (e.g. 59m30s reads `"59m left"`, not `"1h left"`). Pure (see
 * {@link isUrgent}).
 */
export function timeLeftLabel(deadlineIso: string, nowMs: number): string {
  const remainingMs = Math.max(0, new Date(deadlineIso).getTime() - nowMs);
  if (remainingMs >= 60 * 60 * 1000) {
    return `${Math.floor(remainingMs / (60 * 60 * 1000))}h left`;
  }
  return `${Math.max(1, Math.floor(remainingMs / 60_000))}m left`;
}
