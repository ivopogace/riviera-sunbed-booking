/**
 * A count with its noun agreed, e.g. `1 booking` / `2 bookings`. Regular `-s` plurals only, which is
 * every noun the app counts today (booking, review, set, row, venue).
 *
 * <p>Shared because the surfaces that count things are spread across features and the mistake is
 * invisible until a fixture happens to hold exactly one: a hard-coded "reviews" read correctly for
 * as long as the demo seed carried 326, and became wrong the moment a real venue had its first.
 */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
