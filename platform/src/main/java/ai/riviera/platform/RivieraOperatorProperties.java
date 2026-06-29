package ai.riviera.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The single operator credential for the venue write API (U7). {@code username} defaults to
 * {@code operator}; the {@code password} is supplied per environment via the
 * {@code RIVIERA_OPERATOR_PASSWORD} variable and is <strong>never committed</strong>. When blank
 * (local dev, or tests that don't set it) {@code SecurityConfig} generates a random password so the
 * context still boots — the write API is then effectively locked until a real password is configured.
 * The real staff/admin identity model is a later concern (see {@code SecurityConfig}).
 */
@ConfigurationProperties("riviera.operator")
record RivieraOperatorProperties(String username, String password) {

	RivieraOperatorProperties {
		if (username == null || username.isBlank()) {
			username = "operator";
		}
	}
}
