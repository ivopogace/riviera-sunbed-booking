package ai.riviera.platform.payout.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.payout.application.VenueChangeFee;

/**
 * Binds {@link VenueChangeFeeProperties} and exposes it to the application layer as the plain
 * {@link VenueChangeFee} value. Package-private config inside the module (invariant #11).
 */
@Configuration
@EnableConfigurationProperties(VenueChangeFeeProperties.class)
class PayoutFeeConfig {

	@Bean
	VenueChangeFee venueChangeFee(VenueChangeFeeProperties properties) {
		return new VenueChangeFee(properties.venueChangeFeeMinor());
	}
}
