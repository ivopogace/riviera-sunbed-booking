import { pluralOf } from './plural';

/**
 * The venue's stay rule as the tourist reads it: "Stays of up to 5 days at this venue." or, with no
 * maximum, "Stays of any length this season." One sentence for the calendar and the venue page, so
 * the two cannot drift. Display only — the reserve path enforces the maximum.
 */
export function stayRule(maxStayDays: number | null | undefined): string {
  if (maxStayDays == null) {
    return $localize`Stays of any length this season.`;
  }
  return pluralOf(
    maxStayDays,
    $localize`Stays of up to ${maxStayDays}:count: day at this venue.`,
    $localize`Stays of up to ${maxStayDays}:count: days at this venue.`,
  );
}
