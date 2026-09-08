package ai.riviera.platform.venue.application;

import java.util.Set;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The validated intent to change price, tier and/or pool on a swept selection of sets in one write
 * ({@link EditBeachMap#applyToSets}). A {@code null} field is <em>untouched</em>: every named set
 * keeps its own value for it. At least one field is touched, the price is stated both-or-neither
 * (integer minor units + ISO-4217 currency, invariant #5), {@code tier} is the exact token the DB
 * stores, and the id set is non-empty and bounded by {@link #MAX_SETS}. The set is defensively copied.
 */
public record SetBatchCommand(Set<SetId> setIds, String tier, Pool pool, Long priceMinor,
		String priceCurrency) {

	/** The most sets one batch may name — the whole map, at the layout generator's cap. */
	public static final int MAX_SETS = LayoutCommand.MAX_SETS;

	public SetBatchCommand {
		setIds = Set.copyOf(setIds); // defensive copy + null-hostile
		if (setIds.isEmpty()) {
			throw new IllegalArgumentException("setIds must name at least one set");
		}
		if (setIds.size() > MAX_SETS) {
			throw new IllegalArgumentException("setIds must name at most " + MAX_SETS + " sets");
		}
		if (tier != null) {
			SetCommand.requireTier(tier);
		}
		if ((priceMinor == null) != (priceCurrency == null)) {
			throw new IllegalArgumentException("price needs both minor units and currency");
		}
		if (priceMinor != null) {
			VenueFieldValidation.requireNonNegativeMinor(priceMinor, "priceMinor");
			VenueFieldValidation.requireIsoCurrency(priceCurrency, "priceCurrency");
		}
		if (tier == null && pool == null && priceMinor == null) {
			throw new IllegalArgumentException("a batch must change at least one of tier, pool or price");
		}
	}
}
