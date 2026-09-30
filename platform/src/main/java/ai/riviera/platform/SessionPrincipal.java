package ai.riviera.platform;

import java.util.Collection;
import java.util.Objects;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;

/**
 * Every session's principal: a {@link User} that keeps the {@link CredentialStamp} of the hash it was built from
 * after its credentials are erased, for {@link SessionCredentialFilter}'s per-request check (#1306).
 */
final class SessionPrincipal extends User {

	private static final long serialVersionUID = 1L;

	private final String credentialStamp;

	/** For a {@code UserDetailsService}: the provider verifies {@code passwordHash}, then erases it. */
	SessionPrincipal(String username, String passwordHash, boolean enabled,
			Collection<? extends GrantedAuthority> authorities) {
		super(username, passwordHash == null ? "" : passwordHash, enabled, true, true, true, authorities);
		this.credentialStamp = CredentialStamp.of(passwordHash);
	}

	/** A principal no provider verifies (SSO, a re-stamp), stamped with {@code passwordHash} and already erased. */
	static SessionPrincipal erased(String username, String passwordHash,
			Collection<? extends GrantedAuthority> authorities) {
		SessionPrincipal principal = new SessionPrincipal(username, passwordHash, true, authorities);
		principal.eraseCredentials();
		return principal;
	}

	String credentialStamp() {
		return credentialStamp;
	}

	@Override
	public boolean equals(Object other) {
		return other instanceof SessionPrincipal that && super.equals(that)
				&& credentialStamp.equals(that.credentialStamp);
	}

	@Override
	public int hashCode() {
		return Objects.hash(super.hashCode(), credentialStamp);
	}
}
