package ai.riviera.platform.notification.adapter.out;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast guard (design D-6), the mailer twin of {@code MockSsoProdGuard}: a mock mail
 * transport that only logs must never run in production. Exists only under {@code prod} without
 * {@code mailer} (so the default {@link MockMailer} would be live); its constructor throws,
 * aborting startup.
 *
 * <p>Production activates {@code prod,mailer}; {@code prod} alone is the misconfiguration caught.
 * Package-private (invariant #11); pinned by {@code MockMailerProdGuardTest}.
 */
@Component
@Profile("prod & !mailer")
class MockMailerProdGuard {

	MockMailerProdGuard() {
		throw new IllegalStateException(
				"Mock mailer must not run under the 'prod' profile — activate the 'mailer' profile with a real "
						+ "SMTP/provider adapter, or run a non-prod profile for the demo mock.");
	}
}
