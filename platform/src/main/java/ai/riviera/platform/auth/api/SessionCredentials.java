package ai.riviera.platform.auth.api;

import org.springframework.security.core.Authentication;

/**
 * Whether a stored session's authentication is still backed by a current credential (#1306): its credential
 * stamp matches the live account's, and an operator's status may authenticate with an admin flag matching
 * {@code ROLE_ADMIN}. An authentication {@code auth} did not issue (MockMvc's) is current.
 */
public interface SessionCredentials {

	boolean isCurrent(Authentication authentication);
}
