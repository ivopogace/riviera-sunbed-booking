package ai.riviera.platform.venue.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The platform's terms for a newly created venue — currently the default commission rate every
 * new venue is stamped with (exact-integer basis points, invariant #5). Held as server-side
 * configuration so the rate is never client input: {@code OnboardVenueService} stamps it at
 * insert and the operator-facing defaults read serves the same value, keeping the disclosed
 * figure and the stamped rate equal by construction. The admin adjusts a venue's rate afterwards
 * through {@link VenueCommissionAdministration}, forward-only.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated}: Boot validates
 * {@code @ConfigurationProperties} only with a JSR-303 implementation on the classpath, and there
 * is none here. The component is a boxed {@code Integer} so a missing or renamed property key
 * binds {@code null} and fails the boot loudly — a primitive would silently bind {@code 0}, an
 * accepted rate, and every new venue would earn the platform nothing.
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
