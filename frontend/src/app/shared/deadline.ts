/**
 * Render an ISO-8601 UTC instant (e.g. a request-response deadline, issue #98) as a
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
