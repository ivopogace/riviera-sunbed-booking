package ai.riviera.platform.venue.application;

import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.Tier;

/**
 * The validated intent to place or re-place one set position on a venue's beach map (U7) —
 * used by both {@link EditBeachMap#addSet} and {@link EditBeachMap#editSet} (the editor is
 * incremental per-set CRUD). Its compact constructor enforces the same invariants the V2/V12/V43
 * CHECK constraints enforce in the database, so a malformed set is rejected at the boundary:
 * {@code tier} is the exact token the DB stores and {@code pool} the typed {@link Pool} (a set is in
 * exactly one pool — invariant #3), {@code priceMinor} is integer minor units + an ISO-4217 currency
 * (invariant #5), and grid coordinates / position number are 1-based (the V12 CHECKs).
 */
public record SetCommand(String rowLabel, int positionNo, String tier, Pool pool,
		long priceMinor, String priceCurrency, int gridX, int gridY) {

	private static final Set<String> TIERS =
			Stream.of(Tier.values()).map(Enum::name).collect(Collectors.toUnmodifiableSet());

	/** The tier token exactly as {@link Tier} and {@code set_position_tier_check} state it; anything else is rejected. */
	static String requireTier(String tier) {
		if (!TIERS.contains(tier)) {
			throw new IllegalArgumentException("tier must be one of " + TIERS);
		}
		return tier;
	}

	public SetCommand {
		rowLabel = VenueFieldValidation.strip(rowLabel);
		VenueFieldValidation.requireText(rowLabel, "rowLabel", VenueFieldValidation.MAX_ROW_LABEL_LENGTH);
		if (positionNo < 1) {
			throw new IllegalArgumentException("positionNo must be >= 1");
		}
		requireTier(tier);
		if (pool == null) {
			throw new IllegalArgumentException("pool is required");
		}
		VenueFieldValidation.requireNonNegativeMinor(priceMinor, "priceMinor");
		VenueFieldValidation.requireIsoCurrency(priceCurrency, "priceCurrency");
		if (gridX < 1 || gridY < 1) {
			throw new IllegalArgumentException("gridX and gridY must be >= 1");
		}
	}

	/** Where this command places the set — the cell key, the row label and the position number. */
	public SetPlacement placement() {
		return new SetPlacement(rowLabel, positionNo, gridX, gridY);
	}

	/**
	 * Whether applying this command would move the set at {@code stored} — the only edit a hold or
	 * booking can be harmed by, because a reposition silently re-seats a guest who was told this row
	 * and number. Pool, price and tier are excluded on purpose: a booking's charge is snapshotted at
	 * reserve time, and the pool decides only whether a <em>new</em> online booking may claim the set
	 * (invariant #3 is a reserve-time rule). Rationale: RESPONSIBILITIES.md §venue.
	 */
	public boolean disturbs(SetPlacement stored) {
		return !stored.rowLabel().equals(rowLabel)
				|| stored.positionNo() != positionNo
				|| stored.gridX() != gridX
				|| stored.gridY() != gridY;
	}
}
