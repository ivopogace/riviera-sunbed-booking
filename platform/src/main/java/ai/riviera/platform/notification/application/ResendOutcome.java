package ai.riviera.platform.notification.application;

/**
 * What an admin's Resend press achieved — the answer the console shows, and the reason the
 * resend is a synchronous call rather than an event.
 *
 * <p>Every value is an ordinary answer an admin acts on, not an error (`riviera-java-conventions`
 * §6), so the endpoint returns {@code 200} for all of them. The two refusals are distinct: "no
 * such booking" means a wrong id; "never confirmed" means no confirmation was owed, and mailing
 * one would tell the tourist something untrue.
 */
public enum ResendOutcome {

	/** The mail was handed to the transport. */
	SENT,

	/**
	 * Withheld: the address is on the suppression list. Usually the most valuable answer on this
	 * surface — it is the reason a tourist never received the original either, and the lift is the
	 * ADMIN reinstatement rather than another press of this button.
	 */
	WITHHELD_SUPPRESSED,

	/** The send failed. Nothing retries it — the admin can press again once the cause is cleared. */
	TRANSPORT_FAILED,

	/** No booking has this id. */
	NO_SUCH_BOOKING,

	/** The booking exists but never reached {@code CONFIRMED}, so no confirmation was ever due. */
	NOT_CONFIRMED,

	/**
	 * A booking, set or contact fact the mail needs is missing — the same data-integrity fault the
	 * automatic path counts, surfaced here rather than hidden behind a generic failure.
	 */
	MISSING_FACTS
}
