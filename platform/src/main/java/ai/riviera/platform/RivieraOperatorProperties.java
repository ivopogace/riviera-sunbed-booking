package ai.riviera.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Bootstrap-operator provisioning config (#74). This is <strong>no longer a shared login</strong>:
 * credentials are per-operator and DB-backed (see {@code SecurityConfig} / {@code OperatorUserDetailsService}).
 * {@code username} defaults to {@code operator} and names the seeded bootstrap platform-admin operator;
 * {@code password} is supplied per environment via {@code RIVIERA_OPERATOR_PASSWORD} (<strong>never
 * committed</strong>) and is used by {@link OperatorCredentialInitializer} at startup to provision/rotate
 * <em>that one account's</em> credential. When blank, the bootstrap operator has no login and the write
 * API is locked until a credential is configured. Additional operators are provisioned via the
 * {@code operator} module's provisioning port, not this property.
 */
@ConfigurationProperties("riviera.operator")
record RivieraOperatorProperties(String username, String password) {

	RivieraOperatorProperties {
		if (username == null || username.isBlank()) {
			username = "operator";
		}
	}
}
