package ai.riviera.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Bootstrap-operator provisioning config; operator credentials are per-operator and DB-backed.
 * {@code username} (default {@code operator}) names the seeded bootstrap platform-admin;
 * {@code password} comes per environment from {@code RIVIERA_OPERATOR_PASSWORD} (<strong>never
 * committed</strong>) and {@link OperatorCredentialInitializer} stamps it at startup. Blank or
 * outside {@link PasswordPolicy}'s length rule: the bootstrap operator has no login and the write
 * API is locked until one is set. Other operators come through the {@code operator} module.
 */
@ConfigurationProperties("riviera.operator")
record RivieraOperatorProperties(String username, String password) {

	RivieraOperatorProperties {
		if (username == null || username.isBlank()) {
			username = "operator";
		}
	}
}
