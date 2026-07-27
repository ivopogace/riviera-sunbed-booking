package ai.riviera.rootfixture.notification.application;

/**
 * Stands in for {@code notification.application.Mailer} — the raw transport behind the send
 * chokepoint. A composition-root class reaching this bypasses suppression enforcement and the
 * off-thread dispatch, so the rule must reject it.
 */
public interface InternalTransport {

	void send(String toEmail);
}
