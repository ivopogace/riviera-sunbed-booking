/**
 * Render an ISO-8601 UTC instant (e.g. a request-response deadline) as wall-clock time in
 * `Europe/Tirane` (invariant #6), never the viewer's or runtime's default zone; the locale is
 * pinned like `shared/money.ts` so output is deterministic across environments.
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

/** A request is "urgent" — the amber clock chip shows — when its response deadline is under 8h away. */
const URGENT_WINDOW_MS = 8 * 60 * 60 * 1000;

/**
 * True when `deadlineIso` (a UTC instant) is under {@link URGENT_WINDOW_MS} from `nowMs` and not
 * yet past (the sweep owns those); drives the Requests tab's amber chip. Pure: the caller captures
 * `now` once at the component boundary, never an ambient `new Date()`, so tests are deterministic.
 */
export function isUrgent(deadlineIso: string, nowMs: number): boolean {
  const remainingMs = new Date(deadlineIso).getTime() - nowMs;
  return remainingMs > 0 && remainingMs < URGENT_WINDOW_MS;
}

/**
 * The urgency chip's time-left label: hours (`"3h left"`) from a full hour up, else minutes
 * (`"45m left"`), at least `"1m left"`. Both branches **floor** so it never overstates the time
 * left (59m30s reads `"59m left"`, not `"1h left"`). Pure (see {@link isUrgent}).
 */
export function timeLeftLabel(deadlineIso: string, nowMs: number): string {
  const remainingMs = Math.max(0, new Date(deadlineIso).getTime() - nowMs);
  if (remainingMs >= 60 * 60 * 1000) {
    return `${Math.floor(remainingMs / (60 * 60 * 1000))}h left`;
  }
  return `${Math.max(1, Math.floor(remainingMs / 60_000))}m left`;
}
