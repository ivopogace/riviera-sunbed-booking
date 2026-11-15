/**
 * A count with its noun agreed, e.g. `1 booking` / `2 bookings`; regular `-s` plurals only (every
 * noun the app counts today). Use it wherever a count meets a noun: a hard-coded plural reads right
 * until a fixture holds exactly one.
 */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * A count's phrase in the build's language: `one` for exactly 1, else `other`, each a whole
 * `$localize` message carrying the count, e.g. `` pluralOf(n, $localize`${n}:count: day`, $localize`${n}:count: days`) ``.
 * English, Albanian, Italian and German all split whole counts into exactly these two forms.
 */
export function pluralOf(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}
