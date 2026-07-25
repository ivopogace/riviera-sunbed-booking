package ai.riviera.platform;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;

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
	private final OperatorAccounts accounts;
	private final PasswordEncoder encoder;
	private final PrincipalSessionRevoker sessionRevoker;
	private final RivieraOperatorProperties operator;

	OperatorCredentialInitializer(OperatorProvisioning provisioning, OperatorAccounts accounts,
			PasswordEncoder encoder, PrincipalSessionRevoker sessionRevoker,
			RivieraOperatorProperties operator) {
		this.provisioning = provisioning;
		this.accounts = accounts;
		this.encoder = encoder;
		this.sessionRevoker = sessionRevoker;
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
		boolean rotated = isGenuineRotation(username, password);
		boolean updated = provisioning.setPassword(username, encoder.encode(password));
		if (updated && rotated) {
			// A rotated credential must not leave the sessions it authorized alive (#128) — restarting
			// does not clear SPRING_SESSION, that being the point of a server-side session store.
			sessionRevoker.revokeAll(username);
			log.info("RIVIERA_OPERATOR_PASSWORD changed for '{}' — live sessions revoked.", username);
		}
		if (updated) {
			log.info("Provisioned credential for bootstrap operator '{}'.", username);
		} else {
			log.warn("RIVIERA_OPERATOR_PASSWORD is set but no operator row named '{}' exists to receive "
					+ "it — the write API stays locked. Check riviera.operator.username matches a seeded "
					+ "operator.", username);
		}
	}

	/**
	 * Whether the configured password differs from the one currently stored — i.e. a real rotation
	 * rather than this runner's ordinary every-boot re-stamp. Hash equality cannot answer this: bcrypt
	 * re-salts, so re-encoding the same password yields a different hash every time, and revoking on
	 * that would sign the admin out on every deploy. Comparing the raw configured password against the
	 * stored hash does answer it. No stored hash yet (first ever boot) is not a rotation — there is no
	 * prior session to invalidate.
	 */
	private boolean isGenuineRotation(String username, String password) {
		return accounts.findByUsername(username)
				.map(OperatorCredential::passwordHash)
				.filter(storedHash -> !encoder.matches(password, storedHash))
				.isPresent();
	}
}
