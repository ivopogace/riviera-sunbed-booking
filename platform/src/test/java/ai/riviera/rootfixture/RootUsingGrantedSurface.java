package ai.riviera.rootfixture;

import ai.riviera.rootfixture.auth.api.GrantedSessionPort;

/** The control: a composition-root stand-in reaching only a granted published surface. */
public class RootUsingGrantedSurface {

	private final GrantedSessionPort sessions;

	public RootUsingGrantedSurface(GrantedSessionPort sessions) {
		this.sessions = sessions;
	}

	public boolean admit(String principalName) {
		return sessions.isCurrent(principalName);
	}
}
