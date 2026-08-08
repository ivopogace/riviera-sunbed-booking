package ai.riviera.platform;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast guard (design D-4): a fake identity provider must never be reachable in
 * production. This bean exists <strong>only</strong> when the {@code prod} profile is active <em>and</em>
 * the {@code sso} profile is not (so the default {@code MockSsoGateway}/{@code MockSsoIdpController} would
 * be live) — the {@code @Profile("prod & !sso")} expression — and its constructor throws, aborting
 * application startup.
 *
 * <p>The intended production activation is {@code prod,sso} (real adapters, no mock); {@code prod} alone
 * is the misconfiguration this guard catches. The non-prod demo env may run the mock (like the payment
 * stub), so no guard fires there. Package-private (invariant #11); pinned by {@code MockSsoProdGuardTest}.
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
