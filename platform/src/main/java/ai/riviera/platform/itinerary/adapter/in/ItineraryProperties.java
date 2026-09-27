package ai.riviera.platform.itinerary.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code riviera.itinerary.max-switches}: the most moves a stitched plan may ask of a guest, default
 * and ceiling {@link #CEILING} (design D13), at least one. Validated in the compact constructor, not
 * {@code @Validated}: no JSR-303 implementation is on the classpath. Read via {@code ItineraryConfig}.
 */
@ConfigurationProperties("riviera.itinerary")
public record ItineraryProperties(Integer maxSwitches) {

	static final int CEILING = 3;

	public ItineraryProperties {
		maxSwitches = maxSwitches == null ? CEILING : maxSwitches;
		if (maxSwitches < 1 || maxSwitches > CEILING) {
			throw new IllegalArgumentException("riviera.itinerary.max-switches must be between 1 and " + CEILING
					+ ", but was " + maxSwitches + "; past three moves a venue cannot host the stay (design D13)");
		}
	}
}
