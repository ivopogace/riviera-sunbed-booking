package ai.riviera.rootfixture;

import ai.riviera.rootfixture.notification.application.InternalTransport;

/** A violation: a composition-root stand-in reaching a module's internal {@code application} package. */
public class RootReachingModuleInternals {

	private final InternalTransport transport;

	public RootReachingModuleInternals(InternalTransport transport) {
		this.transport = transport;
	}

	public void send(String toEmail) {
		transport.send(toEmail);
	}
}
