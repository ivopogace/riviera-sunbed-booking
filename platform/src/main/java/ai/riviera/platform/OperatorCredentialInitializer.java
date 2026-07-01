package ai.riviera.platform;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import ai.riviera.platform.operator.api.OperatorProvisioning;

/**
 * Boot-time provisioning of the bootstrap operator's credential (#74) — how the initial platform-admin
 * operator gets a login without committing a password. On startup, if {@code RIVIERA_OPERATOR_PASSWORD}
 * ({@link RivieraOperatorProperties#password}) is set, its value is encoded with the delegating
 * {@link PasswordEncoder} (all crypto stays at the edge) and stored on the seeded bootstrap operator
 * via {@link OperatorProvisioning#setPassword}. Setting the variable to a new value and restarting is
 * therefore the credential-<em>rotation</em> path for that account. When it is blank, the operator
 * write API is locked (no login) — logged at WARN, never with the value (invariant #7).
 *
 * <p>This is deliberately an edge {@link ApplicationRunner}, not domain logic: it runs only in the full
 * application context (a {@code @WebMvcTest} slice does not component-scan it) and only touches the
 * bootstrap account. Additional operators are provisioned through {@link OperatorProvisioning} directly
 * (a future admin console), not here. Idempotent: it re-stamps the same password on each boot (bcrypt
 * salts differ, the password still verifies) rather than tracking prior state.
 */
@Component
class OperatorCredentialInitializer implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(OperatorCredentialInitializer.class);

	private final OperatorProvisioning provisioning;
	private final PasswordEncoder encoder;
	private final RivieraOperatorProperties operator;

	OperatorCredentialInitializer(OperatorProvisioning provisioning, PasswordEncoder encoder,
			RivieraOperatorProperties operator) {
		this.provisioning = provisioning;
		this.encoder = encoder;
		this.operator = operator;
	}

	@Override
	public void run(ApplicationArguments args) {
		String username = operator.username();
		String password = operator.password();
		if (password == null || password.isBlank()) {
			log.warn("No RIVIERA_OPERATOR_PASSWORD set — the bootstrap operator '{}' has no login; the "
					+ "operator write API is locked until you configure one.", username);
			return;
		}
		boolean updated = provisioning.setPassword(username, encoder.encode(password));
		if (updated) {
			log.info("Provisioned credential for bootstrap operator '{}'.", username);
		} else {
			log.warn("RIVIERA_OPERATOR_PASSWORD is set but no operator row named '{}' exists to receive "
					+ "it — the write API stays locked. Check riviera.operator.username matches a seeded "
					+ "operator.", username);
		}
	}
}
