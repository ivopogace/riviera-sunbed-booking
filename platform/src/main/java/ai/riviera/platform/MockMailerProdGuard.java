package ai.riviera.platform;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast guard (S8, epic #108, design D-6), the mailer twin of {@code MockSsoProdGuard}: a mock mail
 * transport that only logs must never run in production. This bean exists <strong>only</strong> when the
 * {@code prod} profile is active <em>and</em> {@code mailer} is not (so the default {@link MockMailer}
 * would be live) — the {@code @Profile("prod & !mailer")} expression — and its constructor throws,
 * aborting startup.
 *
 * <p>The intended production activation is {@code prod,mailer} (a real adapter, no mock); {@code prod}
 * alone is the misconfiguration this guard catches. The non-prod demo env may run the mock, so no guard
 * fires there. Package-private (invariant #11); pinned by {@code MockMailerProdGuardTest}.
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
