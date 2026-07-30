package ai.riviera.platform.notification.application;

/**
 * What triggered a booking-confirmation mail attempt (#380) — the dimension that makes the delivery
 * history readable as "sent automatically 14:02, resent by admin 09:31".
 *
 * <p>The constant names <strong>are</strong> the {@code trigger_source} tokens V36's {@code CHECK}
 * lists (`riviera-java-conventions` §6a — the tightest lockstep available, since there is no second
 * spelling to drift). {@code ConfirmationMailAttemptsIT} inserts every constant, so renaming one
 * without the matching migration fails there rather than at the first production send.
 */
public enum MailAttemptSource {

	/** The registry listener reacting to {@code BookingConfirmed} (#371) — the ordinary path. */
	AUTOMATIC,

	/** A platform admin pressing Resend on the mail-delivery view (#380). */
	ADMIN_RESEND
}
