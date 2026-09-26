package ai.riviera.platform.venue.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The platform's terms for a new venue: the default commission rate (basis points, invariant #5),
 * server-side so it is never client input — {@code OnboardVenueService} stamps it and the defaults
 * read serves the same value. Later changes go through {@link VenueCommissionAdministration}.
 * Validated in the compact constructor (no JSR-303 on the classpath for {@code @Validated}); boxed
 * so a missing key binds {@code null} and fails the boot; a primitive would bind an accepted 0.
 *
 * @param defaultCommissionBps the rate stamped on every new venue, 0–10000 basis points; required
 */
@ConfigurationProperties("riviera.venue.creation")
public record VenueCreationProperties(Integer defaultCommissionBps) {

	public VenueCreationProperties {
		if (defaultCommissionBps == null) {
			throw new IllegalArgumentException(
					"riviera.venue.creation.default-commission-bps is required");
		}
		VenueFieldValidation.requireCommissionBps(defaultCommissionBps);
	}
}
