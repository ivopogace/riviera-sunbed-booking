package ai.riviera.rootfixture.notification.api;

/**
 * Stands in for {@code notification.api.MailSender} — the one published surface the composition root
 * is allowed to reach. The control case: a rule that rejected everything would pass its negative
 * proof while being useless.
 */
public interface GrantedSendPort {

	void sendPasswordReset(String toEmail);
}
