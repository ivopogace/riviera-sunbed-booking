package ai.riviera.platform.notification.application;

/**
 * Why an address is on the do-not-mail list (#382). Tokens are kept in lockstep with the V32
 * {@code email_suppression.reason CHECK} constraint (riviera-java-conventions §6a).
 */
public enum SuppressionReason {

	/** The provider reported the mailbox as permanently undeliverable. */
	HARD_BOUNCE,

	/** The recipient marked a platform mail as spam. */
	COMPLAINT,

	/** An operator/admin suppressed the address by hand. */
	MANUAL
}
