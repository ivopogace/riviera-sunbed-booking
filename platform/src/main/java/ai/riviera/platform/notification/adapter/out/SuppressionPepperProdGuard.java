package ai.riviera.platform.notification.adapter.out;

import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.BootPostureGuard;

/**
 * Fences the suppression-key HMAC's pepper (ADR-0012, ADR-0031): outside {@code local}, a blank pepper or the
 * committed dev one refuses the boot, since either makes every stored key dictionary-reversible. The pepper
 * ({@code RIVIERA_SUPPRESSION_PEPPER}) is long-lived: rotating it orphans every stored suppression row.
 * Package-private (invariant #11).
 */
@Component
@Profile("!local")
class SuppressionPepperProdGuard implements BootPostureGuard {

	/** Must stay in lockstep with the committed pepper in application-local.properties (§6a). */
	static final String DEV_DEFAULT_PEPPER = "dev-only-suppression-pepper";

	private static final String PEPPER_KEY = "riviera.notification.suppression-pepper";

	private static final String GAP = "Suppression pepper: set RIVIERA_SUPPRESSION_PEPPER to a long-lived random "
			+ "secret (ADR-0012; rotating it orphans every stored key). The committed dev pepper serves 'local' only.";

	@Override
	public Optional<String> gap(Environment environment) {
		String pepper = environment.getProperty(PEPPER_KEY, "");
		return pepper.isBlank() || DEV_DEFAULT_PEPPER.equals(pepper) ? Optional.of(GAP) : Optional.empty();
	}
}
