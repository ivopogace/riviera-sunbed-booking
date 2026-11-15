package ai.riviera.platform.auth.adapter.out;

import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.BootPostureGuard;

/**
 * Fences the mock identity provider (design D-4, ADR-0031): present only where {@code MockSsoGateway} and
 * {@code MockSsoIdpController} would be live with no {@code demo} marker, so the boot is refused. A deployment
 * runs {@code sso} (real adapters); a demo opts into the mock with {@code demo}. Package-private (invariant #11).
 */
@Component
@Profile("!demo & !sso")
class MockSsoProdGuard implements BootPostureGuard {

	private static final String GAP = "SSO: the mock identity provider would be live. Activate 'sso' with real "
			+ "provider credentials, or 'demo' to run the mock on purpose.";

	@Override
	public Optional<String> gap(Environment environment) {
		return Optional.of(GAP);
	}
}
