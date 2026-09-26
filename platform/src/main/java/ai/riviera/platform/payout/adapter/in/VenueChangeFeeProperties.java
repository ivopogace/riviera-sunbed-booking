package ai.riviera.platform.payout.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The <strong>seed</strong> of the venue-change fee, and its fallback when the
 * {@code platform_setting} row (the amount charged) is missing. EUR minor units (invariant #5), flat,
 * platform-wide (ADR-0021). Checked here, not by {@code @Validated}: no JSR-303 implementation is on
 * the classpath. Never negative: direction is the entry type (invariant #9).
 *
 * @param venueChangeFeeMinor default {@code 500}; above {@code VenueChangeFeeAmount.MAX_FEE_MINOR}
 *        it fails the context at startup, in {@link PayoutFeeConfig}
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
