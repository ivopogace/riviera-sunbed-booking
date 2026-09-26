package ai.riviera.platform.notification.adapter.out;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast guard (ADR-0012), the pepper sibling of {@code MockMailerProdGuard}: the
 * email-suppression key HMAC must never run on the committed dev pepper in production. Exists under
 * {@code prod}; its constructor throws only when the pepper is blank or still the committed dev
 * default. The pepper ({@code RIVIERA_SUPPRESSION_PEPPER}) is long-lived: rotating it orphans every
 * stored suppression row (ADR-0012). Package-private (invariant #11); pinned by
 * {@code SuppressionPepperProdGuardTest}.
 */
@Component
@Profile("prod")
class SuppressionPepperProdGuard {

	/** Must stay in lockstep with the committed default in application.properties (§6a). */
	static final String DEV_DEFAULT_PEPPER = "dev-only-suppression-pepper";

	SuppressionPepperProdGuard(
			@Value("${riviera.notification.suppression-pepper:}") String pepper) {
		if (pepper.isBlank() || DEV_DEFAULT_PEPPER.equals(pepper)) {
			throw new IllegalStateException(
					"riviera.notification.suppression-pepper must be a real secret under the 'prod' profile — "
							+ "set RIVIERA_SUPPRESSION_PEPPER (ADR-0012; rotating it orphans all stored keys)");
		}
	}
}
