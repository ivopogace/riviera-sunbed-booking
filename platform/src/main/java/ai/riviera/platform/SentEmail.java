package ai.riviera.platform;

import java.net.URI;

/**
 * One recovery email the {@link MockMailer} recorded instead of sending (S8, epic #108) — enough for a
 * developer/demo to follow the flow and for backend ITs to complete a verify/reset journey by pulling the
 * tokenized {@link #link} out of the "sent" record. Not used by the real {@link SmtpMailer}.
 */
record SentEmail(String toEmail, Kind kind, URI link) {

	/** Which recovery message this is. */
	enum Kind {
		EMAIL_VERIFICATION,
		PASSWORD_RESET
	}
}
