package ai.riviera.platform.venue.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The platform's terms for a newly created venue — currently the default commission rate every
 * new venue is stamped with (exact-integer basis points, invariant #5). Held as server-side
 * configuration so the rate is never client input: {@code VenueAdminService} stamps it at insert
 * and the operator-facing defaults read serves the same value, keeping the disclosed figure and
 * the stamped rate equal by construction. The admin adjusts a venue's rate afterwards through
 * {@link VenueCommissionAdministration}, forward-only.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated}: Boot validates
 * {@code @ConfigurationProperties} only with a JSR-303 implementation on the classpath, and there
 * is none here — an out-of-range value must fail the boot, not stamp invalid rows.
 *
 * @param defaultCommissionBps the rate stamped on every new venue, 0–10000 basis points
 */
@ConfigurationProperties("riviera.venue.creation")
public record VenueCreationProperties(int defaultCommissionBps) {

	public VenueCreationProperties {
		VenueFieldValidation.requireCommissionBps(defaultCommissionBps);
	}
}
