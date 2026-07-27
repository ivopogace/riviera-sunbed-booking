package ai.riviera.rootfixture;

import ai.riviera.rootfixture.notification.application.InternalTransport;

/** The violation: a composition-root stand-in reaching a module's internal {@code application} package. */
public class RootImportingUngrantedSurface {

	private final InternalTransport transport;

	public RootImportingUngrantedSurface(InternalTransport transport) {
		this.transport = transport;
	}

	public void send(String toEmail) {
		transport.send(toEmail);
	}
}
