/**
 * A count with its noun agreed, e.g. `1 booking` / `2 bookings`; regular `-s` plurals only (every
 * noun the app counts today). Use it wherever a count meets a noun: a hard-coded plural reads right
 * until a fixture holds exactly one.
 */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
