package ai.riviera.platform.venue.application;

import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.SetPrice;
import ai.riviera.platform.venue.vocabulary.Tier;

/**
 * The validated intent to place one set on a venue's beach map ({@link EditBeachMap#addSet},
 * {@link EditBeachMap#editSet}, the bulk save). Its row label is the letter of {@code gridY}
 * ({@link SetPlacement#rowLabelOf}). The compact constructor enforces the V12/V76/V77 CHECKs:
 * {@code tier} the exact DB token, {@code pool} typed (invariant #3), the price EUR minor units of at
 * least €0.50 ({@link SetPrice}, invariant #5), grid coordinates and position number 1-based.
 */
public record SetCommand(int positionNo, String tier, Pool pool,
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
		if (positionNo < 1) {
			throw new IllegalArgumentException("positionNo must be >= 1");
		}
		requireTier(tier);
		if (pool == null) {
			throw new IllegalArgumentException("pool is required");
		}
		SetPrice.require(priceMinor, priceCurrency);
		if (gridX < 1) {
			throw new IllegalArgumentException("gridX must be >= 1");
		}
		SetPlacement.rowLabelOf(gridY);
	}

	/** The set's row label: always its grid row's letter, whatever a client sent. */
	public String rowLabel() {
		return SetPlacement.rowLabelOf(gridY);
	}

	/** Where this command places the set — the cell key, the row label and the position number. */
	public SetPlacement placement() {
		return new SetPlacement(rowLabel(), positionNo, gridX, gridY);
	}

	/**
	 * Whether this command would move the set at {@code stored} — the only edit that harms a hold
	 * or booking (it re-seats the guest). Pool, price and tier are excluded on purpose: the charge
	 * is snapshotted at reserve, #3 is a reserve-time rule. Rationale: RESPONSIBILITIES.md §venue.
	 */
	public boolean disturbs(SetPlacement stored) {
		return !stored.rowLabel().equals(rowLabel())
				|| stored.positionNo() != positionNo
				|| stored.gridX() != gridX
				|| stored.gridY() != gridY;
	}
}
