package ai.riviera.platform;

import java.util.Optional;

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
 * Boot-time provisioning of the bootstrap admin's credential from {@code RIVIERA_OPERATOR_PASSWORD}
 * ({@link RivieraOperatorProperties#password}) via {@link OperatorProvisioning#setPassword}, written only when the
 * stored hash does not {@code matches} it: bcrypt re-salts, and a new hash ends every session's stamp (#1306).
 * Blank or outside {@link PasswordPolicy}'s length rule: not stamped, one WARN without the value, never a boot
 * failure. Touches only the bootstrap account: {@code RESPONSIBILITIES.md} §Platform edge. Runbook:
 * {@code docs/runbooks/operator-credential-provisioning.md}.
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
		if (!PasswordPolicy.hasPermittedLength(password)) {
			log.warn("RIVIERA_OPERATOR_PASSWORD is outside the {}-character to {}-byte password rule and is "
					+ "ignored like an empty value — the bootstrap operator '{}' receives no credential from it.",
					PasswordPolicy.MIN_LENGTH, PasswordPolicy.MAX_BYTES, username);
			return;
		}
		Optional<String> storedHash = accounts.findByUsername(username).map(OperatorCredential::passwordHash);
		if (storedHash.filter(hash -> encoder.matches(password, hash)).isPresent()) {
			log.info("Bootstrap operator '{}' already holds the configured credential.", username);
			return;
		}
		boolean rotated = storedHash.isPresent();
		boolean updated = provisioning.setPassword(username, encoder.encode(password));
		if (updated && rotated) {
			// A restart does not clear SPRING_SESSION, so the rotated-away sessions must go.
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
}
