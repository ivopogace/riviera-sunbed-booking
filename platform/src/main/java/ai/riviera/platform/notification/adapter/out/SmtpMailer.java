package ai.riviera.platform.notification.adapter.out;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Currency;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;

/**
 * Real SMTP {@link Mailer} (#368, ADR-0011; booking confirmations added in #371, cancellations in
 * #374, the accepted request's payment deadline in #373): delivers every message kind over the
 * configured relay via {@link JavaMailSender} — Scaleway TEM in deployment, any RFC-compliant relay by
 * config ({@code application-mailer.properties}; STARTTLS on 587, finite timeouts). Active under
 * {@code @Profile("mailer")} — where missing SMTP config fails at boot (unresolved placeholder), never on
 * first send — and under the local-dev {@code smtp4dev} profile, whose defaults target the local sink
 * ({@code application-smtp4dev.properties}). Messages are plain text with no tracking markup
 * (ADR-0011 §25-TDDDG posture). Neither bearer credential (invariant #7) is ever logged here — not the
 * tokenized link, not the arrival code — and untrusted text reaching a <em>header</em> is CRLF-stripped
 * ({@link #headerSafe}). Package-private driven adapter (invariant #11); pinned by
 * {@code SmtpMailerIT} + {@code MailerProfileWiringTest}.
 */
@Component
@Profile("mailer | smtp4dev")
class SmtpMailer implements Mailer {

	private static final String VERIFICATION_SUBJECT = "Verify your email";
	private static final String RESET_SUBJECT = "Reset your password";
	private static final String CONFIRMATION_SUBJECT = "Your booking at %s is confirmed";
	private static final String CANCELLATION_SUBJECT = "Your booking at %s is cancelled";
	private static final String PAYMENT_DUE_SUBJECT = "%s accepted your request — payment due";
	private static final String OPERATOR_APPROVED_SUBJECT = "Your operator account is approved";
	private static final String REQUEST_DECLINED_SUBJECT = "%s declined your booking request";
	private static final String REQUEST_EXPIRED_SUBJECT = "Your booking request to %s has expired";

	/** English-only in v1 (ADR-0011); the locale is explicit so the JVM default cannot change the copy. */
	private static final DateTimeFormatter DATE_FORMAT =
			DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);

	/**
	 * The zone every deadline in this mail is stated in (invariant #6). A pay-by instant is only
	 * actionable as a wall clock, and {@code Europe/Tirane} is the one both the guest and the venue
	 * are standing in; rendering it in UTC or in the JVM default would be a different time of day.
	 */
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	/**
	 * A deadline needs the hour, and the offset so a guest reading it abroad cannot be an hour out —
	 * the one place this transport prints a time rather than a date.
	 */
	private static final DateTimeFormatter DEADLINE_FORMAT =
			DateTimeFormatter.ofPattern("d MMMM yyyy 'at' HH:mm (zzz)", Locale.ENGLISH);

	private final JavaMailSender sender;
	private final String from;

	SmtpMailer(JavaMailSender sender, @Value("${riviera.mail.from}") String from) {
		if (from.isBlank()) {
			throw new IllegalStateException(
					"riviera.mail.from must be set (RIVIERA_MAIL_FROM) when the 'mailer' profile is active");
		}
		this.sender = sender;
		this.from = from;
	}

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		send(toEmail, VERIFICATION_SUBJECT, """
				Confirm your email address by opening this link:

				%s

				If you didn't create an account, you can ignore this message.""".formatted(verificationLink));
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		send(toEmail, RESET_SUBJECT, """
				Reset your password by opening this link:

				%s

				The link is valid once, for a limited time. If you didn't request a reset, you can ignore
				this message — your password is unchanged.""".formatted(resetLink));
	}

	@Override
	public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		send(toEmail, CONFIRMATION_SUBJECT.formatted(headerSafe(confirmation.venueName())), """
				Your sunbed set is confirmed.

				  Booking code:  %s
				  Venue:         %s
				  Date:          %s
				  Spot:          Row %s, position %d
				  Paid:          %s

				Show the booking code at the venue on arrival."""
				.formatted(confirmation.bookingCode(), confirmation.venueName(),
						DATE_FORMAT.format(confirmation.bookingDate()), confirmation.rowLabel(),
						confirmation.positionNo(),
						formatAmount(confirmation.amountMinor(), confirmation.currency())));
	}

	@Override
	public void sendBookingCancellation(String toEmail, BookingCancellationMail cancellation) {
		send(toEmail, CANCELLATION_SUBJECT.formatted(headerSafe(cancellation.venueName())), """
				%s

				  Booking:  %s
				  Venue:    %s
				  Date:     %s
				%s"""
				.formatted(opening(cancellation), cancellation.bookingCode(), cancellation.venueName(),
						DATE_FORMAT.format(cancellation.bookingDate()), refundLine(cancellation)));
	}

	/**
	 * Why the booking ended, in the tourist's terms. Exhaustive over the published enum with no
	 * {@code default}, so a fourth {@code RefundReason} is a compile error here rather than a blank
	 * first line in someone's inbox.
	 */
	private static String opening(BookingCancellationMail cancellation) {
		return switch (cancellation.reason()) {
			case POLICY -> "Your cancellation is confirmed.";
			case WEATHER -> "The venue cancelled bookings for %s because of the weather."
					.formatted(DATE_FORMAT.format(cancellation.bookingDate()));
			case CONFLICT -> "The venue had to cancel your booking.";
		};
	}

	/**
	 * Nothing refunded is said in words, never as {@code EUR 0.00} — a zero amount on a "Refund:" line
	 * reads as a refund at a glance, which is the opposite of what happened (ADR-0005 tier
	 * {@code NONE}, past the invariant-#4 cutoff).
	 */
	private static String refundLine(BookingCancellationMail cancellation) {
		if (cancellation.refundMinor() <= 0) {
			return """

					No refund applies — the booking was cancelled after the free-cancellation cutoff.""";
		}
		return """
				  Refund:   %s

				The refund is on its way back to the payment method you used; it can take a few working
				days to appear on your statement."""
				.formatted(formatAmount(cancellation.refundMinor(), cancellation.currency()));
	}

	@Override
	public void sendPaymentDue(String toEmail, PaymentDueMail paymentDue) {
		send(toEmail, PAYMENT_DUE_SUBJECT.formatted(headerSafe(paymentDue.venueName())), """
				%s accepted your request — your set is held until you pay.

				  Booking code:  %s
				  Venue:         %s
				  Date:          %s
				  To pay:        %s
				  Pay by:        %s

				Pay here:

				%s

				If we haven't received payment by then the set is released for someone else, and you
				would need to request it again."""
				.formatted(paymentDue.venueName(), paymentDue.bookingCode(), paymentDue.venueName(),
						DATE_FORMAT.format(paymentDue.bookingDate()),
						formatAmount(paymentDue.amountMinor(), paymentDue.currency()),
						DEADLINE_FORMAT.format(paymentDue.payBy().atZone(TIRANE)), paymentDue.payLink()));
	}

	@Override
	public void sendRequestDeclined(String toEmail, RequestDeclinedMail declined) {
		send(toEmail, REQUEST_DECLINED_SUBJECT.formatted(headerSafe(declined.venueName())), """
				%s declined your booking request — nothing is held for you and nothing was charged.

				  Booking code:  %s
				  Venue:         %s
				  Date:          %s

				You can see the request here:

				%s"""
				.formatted(declined.venueName(), declined.bookingCode(), declined.venueName(),
						DATE_FORMAT.format(declined.bookingDate()), declined.statusLink()));
	}

	@Override
	public void sendRequestExpired(String toEmail, RequestExpiredMail expired) {
		send(toEmail, REQUEST_EXPIRED_SUBJECT.formatted(headerSafe(expired.venueName())), """
				Your booking request expired without an answer from the venue — nothing is held for
				you and nothing was charged.

				  Booking code:  %s
				  Venue:         %s
				  Date:          %s

				You can see the request here:

				%s"""
				.formatted(expired.bookingCode(), expired.venueName(),
						DATE_FORMAT.format(expired.bookingDate()), expired.statusLink()));
	}

	@Override
	public void sendOperatorApproved(String toEmail, URI signInLink) {
		send(toEmail, OPERATOR_APPROVED_SUBJECT, """
				Your operator account has been approved — you can sign in now:

				%s

				Signing in for the first time takes you to venue onboarding.""".formatted(signInLink));
	}

	/**
	 * Integer minor units → a display amount (invariant #5). The exponent comes from the ISO currency
	 * rather than a hard-coded 100, so a zero-decimal currency would render correctly if v1's
	 * EUR-only collection rule ever widens.
	 */
	private static String formatAmount(long amountMinor, String currency) {
		int fractionDigits = Math.max(Currency.getInstance(currency).getDefaultFractionDigits(), 0);
		BigDecimal major = BigDecimal.valueOf(amountMinor).movePointLeft(fractionDigits);
		return "%s %s".formatted(currency, major.setScale(fractionDigits, RoundingMode.UNNECESSARY));
	}

	/**
	 * Strip CR/LF from a value destined for a <em>header</em>. The venue name is operator-supplied and
	 * validated only as non-blank, so it is untrusted text reaching a line-oriented sink — the CRLF class
	 * {@code riviera-java-conventions} §10 names for logs.
	 *
	 * <p><strong>Defence in depth, not a live fix:</strong> {@code SmtpMailerIT}'s injection test passes
	 * with and without this call, because Jakarta Mail already refuses to turn a newline in a subject into
	 * a new header. The call keeps the guarantee <em>ours</em> rather than resting on library internals —
	 * it would start mattering the moment this class moved to {@code MimeMessageHelper}, a raw header API,
	 * or the provider's HTTP API (which ADR-0011 leaves open for v2). Bodies need no such treatment.
	 */
	private static String headerSafe(String value) {
		return value.replaceAll("[\\r\\n]", " ");
	}

	private void send(String toEmail, String subject, String body) {
		SimpleMailMessage message = new SimpleMailMessage();
		message.setFrom(from);
		message.setTo(toEmail);
		message.setSubject(subject);
		message.setText(body);
		sender.send(message);
	}
}
