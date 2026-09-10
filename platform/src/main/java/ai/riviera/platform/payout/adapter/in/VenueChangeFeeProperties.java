package ai.riviera.platform.payout.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * What a venue is charged for a refund its own change caused, bound from
 * {@code riviera.payout.venue-change-fee-minor}. Integer minor units of the collection currency
 * (invariant #5) — EUR in v1, so the amount carries no currency of its own; a second collection
 * currency would give it one. Flat and platform-wide: no per-venue rate, no tier.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated}: no JSR-303
 * implementation is on the classpath, so an annotation would bind and validate nothing. A negative
 * fee would pay the venue for changing a guest's deal, and would put direction in the amount where
 * the ledger keeps it in the entry type.
 *
 * <p>Converted to the application-layer {@code VenueChangeFee} value by {@link PayoutFeeConfig}.
 * Rationale and rejected alternatives: ADR-0021.
 *
 * @param venueChangeFeeMinor default {@code 500} (5 EUR), never negative
 */
@ConfigurationProperties("riviera.payout")
public record VenueChangeFeeProperties(Long venueChangeFeeMinor) {

	private static final long DEFAULT_FEE_MINOR = 500L;

	public VenueChangeFeeProperties {
		venueChangeFeeMinor = venueChangeFeeMinor == null ? DEFAULT_FEE_MINOR : venueChangeFeeMinor;
		if (venueChangeFeeMinor < 0) {
			throw new IllegalArgumentException(
					"riviera.payout.venue-change-fee-minor must not be negative, but was "
							+ venueChangeFeeMinor + "; a fee deducts because its entry type is FEE, never "
							+ "because its amount is signed");
		}
	}
}
