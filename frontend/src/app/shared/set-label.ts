import { SetView, Tier } from './venue-views';

/**
 * The set + tier labelling vocabulary — the one place a set's identity and its tier
 * are turned into rendered text, extracted from per-component copies so a wording change touches
 * one file. Pure and side-effect free, like the sibling `availability-grid` helpers.
 *
 * Three tier variants exist by design, each pinned by its surface's specs: operator surfaces call
 * the premium tier a "Front row" ({@link tierLabel}), accessible names need it lower-case
 * mid-sentence ({@link tierSentenceLabel}), and the tourist booking dialog names it "Premium"
 * ({@link touristTierLabel}). Reconciling the wording across surfaces is a product decision this
 * dedupe deliberately does not make — a non-goal: no rendered-output change.
 */

/** Index a venue's sets by id for label resolution; `undefined` (map not loaded) indexes empty. */
export function setsById(sets: readonly SetView[] | undefined): ReadonlyMap<number, SetView> {
  return new Map((sets ?? []).map((s) => [s.id, s]));
}

/** The set's display label ("A · 3"), or a raw-id fallback for a set the loaded map doesn't know. */
export function setLabel(byId: ReadonlyMap<number, SetView>, setId: number): string {
  const set = byId.get(setId);
  return set ? `${set.rowLabel} · ${set.positionNo}` : `Set ${setId}`;
}

/** The operator-surface tier label — request cards, pricing-row descriptions. */
export function tierLabel(tier: Tier): string {
  return tier === 'PREMIUM' ? 'Front row' : 'Standard';
}

/** {@link tierLabel} lower-cased for mid-sentence use in tile accessible names. */
export function tierSentenceLabel(tier: Tier): string {
  return tierLabel(tier).toLowerCase();
}

/** The tourist-facing tier name — the booking dialog's "Spot N · Premium" meta line. */
export function touristTierLabel(tier: Tier): string {
  return tier === 'PREMIUM' ? 'Premium' : 'Standard';
}
