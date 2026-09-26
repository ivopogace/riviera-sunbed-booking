package ai.riviera.platform;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast guard (design D-4): a fake identity provider must never be reachable in production.
 * Exists only under {@code @Profile("prod & !sso")}, where the default {@code MockSsoGateway} and
 * {@code MockSsoIdpController} would be live, and its constructor throws, aborting startup.
 * Production runs {@code prod,sso} (real adapters, no mock); {@code prod} alone is the
 * misconfiguration caught here. The non-prod demo env may run the mock, like the payment stub.
 * Package-private (invariant #11); pinned by {@code MockSsoProdGuardTest}.
 */
@Component
@Profile("prod & !sso")
class MockSsoProdGuard {

	MockSsoProdGuard() {
		throw new IllegalStateException(
				"Mock SSO gateway must not run under the 'prod' profile — activate the 'sso' profile with real "
						+ "credentials (S5, #116), or run a non-prod profile for the demo mock.");
	}
}
