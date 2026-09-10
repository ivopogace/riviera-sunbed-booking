package ai.riviera.platform.payout.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.payout.application.VenueChangeFeeAmount;

/**
 * Binds {@link VenueChangeFeeProperties} and exposes it to the application layer as the plain
 * {@link VenueChangeFeeAmount} value — the <strong>seed</strong> the stored setting is created with
 * and falls back to, not the amount charged. Package-private config inside the module (invariant #11).
 */
@Configuration
@EnableConfigurationProperties(VenueChangeFeeProperties.class)
class PayoutFeeConfig {

	private static final String COLLECTION_CURRENCY = "EUR"; // v1 collection currency (invariant #5)

	@Bean
	VenueChangeFeeAmount venueChangeFeeSeed(VenueChangeFeeProperties properties) {
		return new VenueChangeFeeAmount(properties.venueChangeFeeMinor(), COLLECTION_CURRENCY);
	}
}
