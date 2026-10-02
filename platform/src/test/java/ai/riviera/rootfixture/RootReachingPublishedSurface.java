package ai.riviera.rootfixture;

import ai.riviera.rootfixture.auth.api.PublishedSessionPort;

/** A violation: a composition-root stand-in reaching a module's published {@code api}. */
public class RootReachingPublishedSurface {

	private final PublishedSessionPort sessions;

	public RootReachingPublishedSurface(PublishedSessionPort sessions) {
		this.sessions = sessions;
	}

	public boolean admit(String principalName) {
		return sessions.isCurrent(principalName);
	}
}
