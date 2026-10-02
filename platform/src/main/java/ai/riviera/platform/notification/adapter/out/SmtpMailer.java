package ai.riviera.platform.notification.adapter.out;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Currency;
import java.util.Locale;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.DayRefundMail;
import ai.riviera.platform.notification.application.MoveReminderMail;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;
import ai.riviera.platform.notification.application.StayConfirmationMail;

/**
 * Real SMTP {@link Mailer} over {@link JavaMailSender} (ADR-0011): Scaleway TEM in deployment, any relay
 * by config ({@code application-mailer.properties}). Under {@code mailer}, missing SMTP config fails at
 * boot, never on first send; {@code smtp4dev} targets the local sink. Plain text, no tracking markup
 * (ADR-0011). Never logs a bearer credential (tokenized link, arrival code; invariant #7), and
 * CRLF-strips untrusted header text ({@link #headerSafe}). Pinned by {@code SmtpMailerIT} and
 * {@code MailerProfileWiringTest}.
 */
@Component
@Profile("mailer | smtp4dev")
class SmtpMailer implements Mailer {

	private static final String VERIFICATION_SUBJECT = "Verify your email";
	private static final String RESET_SUBJECT = "Reset your password";
	private static final String CONFIRMATION_SUBJECT = "Your booking at %s is confirmed";
	private static final String STAY_CONFIRMATION_SUBJECT = "Your stay at %s is confirmed";
	private static final String CANCELLATION_SUBJECT = "Your booking at %s is cancelled";
	private static final String PAYMENT_DUE_SUBJECT = "%s accepted your request — payment due";
	private static final String OPERATOR_APPROVED_SUBJECT = "Your operator account is approved";
	private static final String REQUEST_DECLINED_SUBJECT = "%s declined your booking request";
	private static final String BOOKING_MOVED_SUBJECT = "Your spot at %s has changed";
	private static final String REQUEST_EXPIRED_SUBJECT = "Your booking request to %s has expired";
	private static final String MOVE_REMINDER_SUBJECT = "Tomorrow at %s: your spot moves";
	private static final String DAY_REFUND_SUBJECT = "A day of your booking at %s is refunded";

	/** English-only in v1 (ADR-0011); the locale is explicit so the JVM default cannot change the copy. */
	private static final DateTimeFormatter DATE_FORMAT =
			DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);

	/** The first end of a days range, which shares the second's year. */
	private static final DateTimeFormatter DAY_MONTH_FORMAT =
			DateTimeFormatter.ofPattern("d MMMM", Locale.ENGLISH);

	/** The label column widths of the confirmation, cancellation and moved bodies. */
	private static final int CONFIRMATION_LABEL_WIDTH = 15;
	private static final int CANCELLATION_LABEL_WIDTH = 10;
	private static final int MOVED_LABEL_WIDTH = 15;

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
				  %s
				  Spot:          %s, position %d
				  Paid:          %s

				Show the booking code at the venue on arrival.%s"""
				.formatted(confirmation.bookingCode(), confirmation.venueName(),
						daysLine(confirmation.bookingDate(), confirmation.lastDate(), CONFIRMATION_LABEL_WIDTH),
						confirmation.rowLabel(),
						confirmation.positionNo(),
						formatAmount(confirmation.amountMinor(), confirmation.currency()),
						disclosureLine(confirmation.cancellationWindowAtBirth(),
								confirmation.lateCancelRefundBps())));
	}

	@Override
	public void sendStayConfirmation(String toEmail, StayConfirmationMail confirmation) {
		send(toEmail, STAY_CONFIRMATION_SUBJECT.formatted(headerSafe(confirmation.venueName())), """
				Your stay is confirmed.

				  Booking code:  %s
				  Venue:         %s
				  %s
				  Paid:          %s

				Your spot changes during the stay:

				%s

				Show the same booking code at the venue every morning.%s"""
				.formatted(confirmation.bookingCode(), confirmation.venueName(),
						daysLine(confirmation.firstDate(), confirmation.lastDate(), CONFIRMATION_LABEL_WIDTH),
						formatAmount(confirmation.amountMinor(), confirmation.currency()),
						confirmation.stops().stream()
								.map(stop -> "  %s:  %s, position %d".formatted(span(stop.firstDate(), stop.lastDate()),
										stop.rowLabel(), stop.positionNo()))
								.collect(Collectors.joining("\n")),
						disclosureLine(confirmation.cancellationWindowAtBirth(),
								confirmation.lateCancelRefundBps())));
	}

	@Override
	public void sendBookingCancellation(String toEmail, BookingCancellationMail cancellation) {
		send(toEmail, CANCELLATION_SUBJECT.formatted(headerSafe(cancellation.venueName())), """
				%s

				  Booking:  %s
				  Venue:    %s
				  %s
				%s%s"""
				.formatted(opening(cancellation), cancellation.bookingCode(), cancellation.venueName(),
						daysLine(cancellation.bookingDate(), cancellation.lastDate(), CANCELLATION_LABEL_WIDTH),
						refundLine(cancellation),
						rebookLine(cancellation)));
	}

	/**
	 * The booking's days as one line: {@code Date:  3 July 2027} for one day, or
	 * {@code Days:  3 July – 7 July 2027 (5 days)} for a stay — every day named, without a list
	 * as long as the stay.
	 */
	private static String daysLine(LocalDate first, LocalDate last, int labelWidth) {
		if (first.equals(last)) {
			return padded("Date:", labelWidth) + DATE_FORMAT.format(first);
		}
		long days = ChronoUnit.DAYS.between(first, last) + 1;
		return padded("Days:", labelWidth) + span(first, last) + " (" + days + " days)";
	}

	/** {@code 3 July 2027}, or {@code 3 July – 7 July 2027}: the first end shares the second's year. */
	private static String span(LocalDate first, LocalDate last) {
		if (first.equals(last)) {
			return DATE_FORMAT.format(first);
		}
		return (first.getYear() == last.getYear() ? DAY_MONTH_FORMAT : DATE_FORMAT).format(first)
				+ " – " + DATE_FORMAT.format(last);
	}

	private static String padded(String label, int width) {
		return label + " ".repeat(Math.max(0, width - label.length()));
	}

	/**
	 * Why the booking ended, in the tourist's terms. Exhaustive over the published enum with no
	 * {@code default}, so a new {@code RefundReason} is a compile error here rather than a blank
	 * first line in someone's inbox.
	 */
	private static String opening(BookingCancellationMail cancellation) {
		return switch (cancellation.reason()) {
			case POLICY -> "Your cancellation is confirmed.";
			case WEATHER -> "The venue cancelled bookings for %s because of the weather."
					.formatted(DATE_FORMAT.format(cancellation.bookingDate()));
			case VENUE -> "%s refunded your booking for %s."
					.formatted(cancellation.venueName(), DATE_FORMAT.format(cancellation.bookingDate()));
			case CONFLICT -> "The venue had to cancel your booking.";
			case VENUE_CHANGE -> venueChangeOpening(cancellation);
		};
	}

	/**
	 * A rebook link marks the venue's own remodel; without one the guest took the free exit a move
	 * earned them, which is the same reason from the other side.
	 */
	private static String venueChangeOpening(BookingCancellationMail cancellation) {
		if (cancellation.rebookLink() == null) {
			return "You cancelled the booking the venue had moved, so it is refunded in full.";
		}
		return cancellation.refundMinor() > 0
				? "The venue changed its beach layout and had no free spot left for you, so your booking is "
						+ "cancelled and refunded in full."
				: "The venue changed its beach layout and had no free spot left for you, so your unpaid booking "
						+ "has been released.";
	}

	/**
	 * Nothing refunded is said in words, never as {@code EUR 0.00}, which reads as a refund at a glance
	 * (ADR-0005 tier {@code NONE}, past the evening-before cutoff). A released unpaid booking says
	 * nothing was charged instead of naming a cutoff it never reached.
	 */
	private static String refundLine(BookingCancellationMail cancellation) {
		if (cancellation.refundMinor() > 0) {
			return """
					  Refund:   %s

					The refund is on its way back to the payment method you used; it can take a few working
					days to appear on your statement."""
					.formatted(formatAmount(cancellation.refundMinor(), cancellation.currency()));
		}
		if (cancellation.rebookLink() != null) {
			return """

					Nothing was charged for this booking.""";
		}
		return """

				No refund applies — the booking was cancelled after the free-cancellation cutoff.""";
	}

	/** The way back a venue-caused cancellation owes: that venue's map for the day, or the day's list. */
	private static String rebookLine(BookingCancellationMail cancellation) {
		if (cancellation.rebookLink() == null) {
			return "";
		}
		return """


				Book another spot for the same day:
				%s""".formatted(cancellation.rebookLink());
	}

	@Override
	public void sendPaymentDue(String toEmail, PaymentDueMail paymentDue) {
		send(toEmail, PAYMENT_DUE_SUBJECT.formatted(headerSafe(paymentDue.venueName())), """
				%s accepted your request — your set is held until you pay.

				  Booking code:  %s
				  Venue:         %s
				  %s
				  To pay:        %s
				  Pay by:        %s

				Pay here:

				%s

				If we haven't received payment by then the set is released for someone else, and you
				would need to request it again.%s"""
				.formatted(paymentDue.venueName(), paymentDue.bookingCode(), paymentDue.venueName(),
						daysLine(paymentDue.bookingDate(), paymentDue.lastDate(), CONFIRMATION_LABEL_WIDTH),
						formatAmount(paymentDue.amountMinor(), paymentDue.currency()),
						DEADLINE_FORMAT.format(paymentDue.payBy().atZone(TIRANE)), paymentDue.payLink(),
						disclosureLine(paymentDue.cancellationWindowAtBirth(),
								paymentDue.lateCancelRefundBps())));
	}

	/**
	 * The born-past-free-cancellation line for the confirmation and payment-due bodies, matching the
	 * checkout note. Only CLOSED may say the booking can't be cancelled: LATE stays cancellable
	 * (invariant #10). FREE or null renders nothing; tolerate null forever (payloads lacking the field).
	 */
	private static String disclosureLine(CancellationWindow windowAtBirth, int lateCancelRefundBps) {
		if (windowAtBirth == null || windowAtBirth == CancellationWindow.FREE) {
			return "";
		}
		if (windowAtBirth == CancellationWindow.LATE) {
			return lateCancelRefundBps > 0
					? """


							This booking was made past free cancellation — cancelling refunds only %s%% of the price."""
							.formatted(bpsAsPercent(lateCancelRefundBps))
					: """


							This booking was made past free cancellation — no refund if cancelled.""";
		}
		return """


				This is a non-refundable last-minute booking — it can't be cancelled.""";
	}

	/** Basis points → a display percentage, trimming trailing zeros (2500 → 25, 2250 → 22.5). */
	private static String bpsAsPercent(int bps) {
		return BigDecimal.valueOf(bps).movePointLeft(2).stripTrailingZeros().toPlainString();
	}

	@Override
	public void sendBookingMoved(String toEmail, BookingMovedMail moved) {
		send(toEmail, BOOKING_MOVED_SUBJECT.formatted(headerSafe(moved.venueName())), """
				%s re-laid its beach, so your booking has moved to a new spot: %s%d instead of %s%d, %s.
				Your booking code, price and %s are unchanged.

				  Booking code:  %s
				  Venue:         %s
				  %s
				  Your spot:     Row %s, position %d

				%s

				%s"""
				.formatted(moved.venueName(), moved.toRowLabel(), moved.toPositionNo(), moved.fromRowLabel(),
						moved.fromPositionNo(), distance(moved),
						moved.bookingDate().equals(moved.lastDate()) ? "date" : "days",
						moved.bookingCode(), moved.venueName(),
						daysLine(moved.bookingDate(), moved.lastDate(), MOVED_LABEL_WIDTH), moved.toRowLabel(),
						moved.toPositionNo(), freeExitLine(moved), moved.bookingLink()));
	}

	@Override
	public void sendMoveReminder(String toEmail, MoveReminderMail reminder) {
		send(toEmail, MOVE_REMINDER_SUBJECT.formatted(headerSafe(reminder.venueName())), """
				Tomorrow, %s, your spot at %s changes: %s%d instead of today's %s%d, %s.
				Show the same booking code in the morning and staff will point you to it.

				  Booking code:  %s
				  Venue:         %s
				  Tomorrow:      Row %s, position %d
				  Until:         %s

				Your stay:

				%s"""
				.formatted(DATE_FORMAT.format(reminder.moveDate()), reminder.venueName(), reminder.toRowLabel(),
						reminder.toPositionNo(), reminder.fromRowLabel(), reminder.fromPositionNo(),
						distance(reminder.rowsAway(), reminder.positionsAway()), reminder.bookingCode(),
						reminder.venueName(), reminder.toRowLabel(), reminder.toPositionNo(),
						DATE_FORMAT.format(reminder.stayLastDate()), reminder.bookingLink()));
	}

	@Override
	public void sendDayRefund(String toEmail, DayRefundMail refund) {
		send(toEmail, DAY_REFUND_SUBJECT.formatted(headerSafe(refund.venueName())), """
				%s

				  Booking code:  %s
				  Venue:         %s
				  Refunded day:  %s
				  Refund:        %s

				The refund is on its way back to the payment method you used; it can take a few working
				days to appear on your statement.

				%s"""
				.formatted(dayRefundOpening(refund), refund.bookingCode(),
						refund.venueName(), DATE_FORMAT.format(refund.serviceDate()),
						formatAmount(refund.refundMinor(), refund.currency()), refund.bookingLink()));
	}

	/**
	 * Who refunded the day and what becomes of the spot: weather keeps it the guest's (ADR-0026 §3); the
	 * venue's own refund frees it when released, and names no grounds (ADR-0027 §9). Exhaustive on
	 * purpose: a day reason without copy is a compile error, not a blank first line.
	 */
	private static String dayRefundOpening(DayRefundMail refund) {
		String venue = refund.venueName();
		String day = DATE_FORMAT.format(refund.serviceDate());
		return switch (refund.reason()) {
			case WEATHER -> ("%s closed for the weather on %s, so that day's share of your booking is refunded. Your\n"
					+ "booking stands for its other days, and your spot stays yours.").formatted(venue, day);
			case VENUE -> refund.released()
					? ("%s refunded %s of your booking, so that day's share is on its way back to you. Your spot\n"
							+ "is no longer held for that day; your booking stands for its other days.").formatted(venue, day)
					: ("%s refunded %s of your booking, so that day's share is on its way back to you. Your\n"
							+ "booking stands for its other days.").formatted(venue, day);
			case POLICY, CONFLICT, VENUE_CHANGE -> throw new IllegalArgumentException(
					"a day is refunded for weather or by the venue, not " + refund.reason());
		};
	}

	/** The exit a move earned: in full for a lone booking, these days in full for a stretch, none once the judged day opened. */
	private static String freeExitLine(BookingMovedMail moved) {
		if (moved.freeExitUntil() == null) {
			return "Your stay has already begun, so it can no longer be cancelled. Your booking:";
		}
		String until = DEADLINE_FORMAT.format(moved.freeExitUntil().atZone(TIRANE));
		return moved.stretch()
				? ("If the new spot does not suit you, you can cancel your stay until %s (Albania time), "
						+ "and these days are refunded in full:").formatted(until)
				: "If the new spot does not suit you, you can cancel for a full refund until %s (Albania time):"
						.formatted(until);
	}

	/** "4 positions along the row", "1 row over", "2 rows and 3 positions away". */
	static String distance(BookingMovedMail moved) {
		return distance(moved.rowsAway(), moved.positionsAway());
	}

	static String distance(int rowsAway, int positionsAway) {
		String positions = plural(positionsAway, "position");
		if (rowsAway == 0) {
			return positions + " along the row";
		}
		String rows = plural(rowsAway, "row");
		if (positionsAway == 0) {
			return rows + " over";
		}
		return rows + " and " + positions + " away";
	}

	private static String plural(int count, String noun) {
		return count + " " + noun + (count == 1 ? "" : "s");
	}

	@Override
	public void sendRequestDeclined(String toEmail, RequestDeclinedMail declined) {
		send(toEmail, REQUEST_DECLINED_SUBJECT.formatted(headerSafe(declined.venueName())), """
				%s — nothing is held for you and nothing was charged.

				  Booking code:  %s
				  Venue:         %s
				  %s

				You can see the request here:

				%s"""
				.formatted(declineLine(declined), declined.bookingCode(), declined.venueName(),
						daysLine(declined.bookingDate(), declined.lastDate(), CONFIRMATION_LABEL_WIDTH),
						declined.statusLink()));
	}

	/** The one line that says why the request ended (ADR-0025). */
	private static String declineLine(RequestDeclinedMail declined) {
		return switch (declined.reason()) {
			case VENUE -> declined.venueName() + " declined your booking request";
			case SET_UNAVAILABLE -> declined.venueName() + " could not take your booking request: the set is no longer available for "
					+ (declined.bookingDate().equals(declined.lastDate()) ? "that day" : "those days");
			case ANOTHER_GUEST -> declined.venueName() + " gave that set to another guest, so your booking request was declined";
		};
	}

	@Override
	public void sendRequestExpired(String toEmail, RequestExpiredMail expired) {
		send(toEmail, REQUEST_EXPIRED_SUBJECT.formatted(headerSafe(expired.venueName())), """
				Your booking request expired without an answer from the venue — nothing is held for
				you and nothing was charged.

				  Booking code:  %s
				  Venue:         %s
				  %s

				You can see the request here:

				%s"""
				.formatted(expired.bookingCode(), expired.venueName(),
						daysLine(expired.bookingDate(), expired.lastDate(), CONFIRMATION_LABEL_WIDTH),
						expired.statusLink()));
	}

	@Override
	public void sendOperatorApproved(String toEmail, URI signInLink) {
		send(toEmail, OPERATOR_APPROVED_SUBJECT, """
				Your operator account has been approved.

				Venues you own are now live and bookable by tourists, and any venue you
				add goes live as soon as you create it. Manage them any time from the
				operator console:

				%s""".formatted(signInLink));
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
	 * Strips CR/LF from operator-supplied text bound for a <em>header</em>. Keep it though Jakarta Mail
	 * refuses a newline in a subject today ({@code SmtpMailerIT} passes either way): it starts mattering
	 * under {@code MimeMessageHelper}, a raw header API or the provider's HTTP API. Bodies need none.
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
