package ai.riviera.platform.auth.application;

import java.util.Collection;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;

/**
 * Every session's principal: a {@link User} that keeps its {@link CredentialStamp} after its credentials are
 * erased, for {@link StampedSessionCredentials}' per-request check (#1306). Identity stays {@link User}'s, the name.
 */
public final class SessionPrincipal extends User {

	private static final long serialVersionUID = 1L;

	private final String credentialStamp;

	/** For a {@code UserDetailsService}: the provider verifies {@code passwordHash}, then erases it. */
	SessionPrincipal(String username, String passwordHash, boolean enabled,
			Collection<? extends GrantedAuthority> authorities, String credentialStamp) {
		super(username, passwordHash, enabled, true, true, true, authorities);
		this.credentialStamp = credentialStamp;
	}

	/** A principal no provider verifies (SSO, a re-stamp): no password, already erased. */
	public static SessionPrincipal erased(String username, Collection<? extends GrantedAuthority> authorities,
			String credentialStamp) {
		SessionPrincipal principal = new SessionPrincipal(username, "", true, authorities, credentialStamp);
		principal.eraseCredentials();
		return principal;
	}

	String credentialStamp() {
		return credentialStamp;
	}
}
