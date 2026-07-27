package ai.riviera.rootfixture;

import ai.riviera.rootfixture.notification.api.GrantedSendPort;

/** The control: a composition-root stand-in reaching only a granted published surface. */
public class RootUsingGrantedSurface {

	private final GrantedSendPort mailSender;

	public RootUsingGrantedSurface(GrantedSendPort mailSender) {
		this.mailSender = mailSender;
	}

	public void reset(String toEmail) {
		mailSender.sendPasswordReset(toEmail);
	}
}
