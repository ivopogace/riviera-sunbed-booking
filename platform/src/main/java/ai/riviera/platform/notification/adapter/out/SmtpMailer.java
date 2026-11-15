package ai.riviera.platform.notification.adapter.out;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.notification.adapter.out.MailCopy.Row;
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
import ai.riviera.platform.notification.application.SupportContact;
import ai.riviera.platform.shared.SiteLocale;

/**
 * Real SMTP {@link Mailer} over {@link JavaMailSender} (ADR-0011): Scaleway TEM in deployment, any relay by config
 * ({@code application-mailer.properties}); missing SMTP config fails at boot. Plain text, no tracking markup, copy in
 * the recipient's {@link SiteLocale} ({@link MailCopy}). Never logs a bearer credential (invariant #7); CRLF-strips
 * untrusted header text ({@link #headerSafe}). Pinned by {@code SmtpMailerIT} and {@code MailerProfileWiringTest}.
 */
@Component
@Profile("mailer | smtp4dev")
class SmtpMailer implements Mailer {

	private static final String ROW_BOOKING_CODE = "row.bookingCode";
	private static final String ROW_VENUE = "row.venue";
	private static final String ROW_DATE = "row.date";
	private static final String ROW_DAYS = "row.days";
	private static final String ROW_REFUND = "row.refund";
	private static final String ROW_PAID = "row.paid";
	private static final String SPOT = "value.spot";
	private static final String ROW_SPOT = "value.rowSpot";
	private static final String PARAGRAPH = "\n\n";

	/** The label column of a block that shows a booking's code, venue and days. */
	private static final List<String> BOOKING_ROWS = List.of(ROW_BOOKING_CODE, ROW_VENUE, ROW_DATE, ROW_DAYS);

	private final JavaMailSender sender;
	private final String from;
	private final SupportContact support;

	SmtpMailer(JavaMailSender sender, @Value("${riviera.mail.from}") String from, SupportContact support) {
		if (from.isBlank()) {
			throw new IllegalStateException(
					"riviera.mail.from must be set (RIVIERA_MAIL_FROM) when the 'mailer' profile is active");
		}
		this.sender = sender;
		this.from = from;
		this.support = support;
	}

	@Override
	public void sendEmailVerification(String toEmail, SiteLocale locale, URI verificationLink) {
		MailCopy copy = MailCopy.in(locale);
		send(toEmail, copy.text("verification.subject"), copy.text("verification.body", verificationLink.toString()));
	}

	@Override
	public void sendPasswordReset(String toEmail, SiteLocale locale, URI resetLink) {
		MailCopy copy = MailCopy.in(locale);
		send(toEmail, copy.text("reset.subject"), copy.text("reset.body", resetLink.toString()));
	}

	@Override
	public void sendBookingConfirmation(String toEmail, SiteLocale locale, BookingConfirmationMail confirmation) {
		MailCopy copy = MailCopy.in(locale);
		String block = copy.block(widthOf(BOOKING_ROWS, "row.spot", ROW_PAID), List.of(
				new Row(ROW_BOOKING_CODE, confirmation.bookingCode()),
				new Row(ROW_VENUE, confirmation.venueName()),
				copy.daysRow(confirmation.bookingDate(), confirmation.lastDate()),
				new Row("row.spot", copy.text(SPOT, confirmation.rowLabel(), String.valueOf(confirmation.positionNo()))),
				new Row(ROW_PAID, copy.amount(confirmation.amountMinor(), confirmation.currency()))));
		send(toEmail, copy.text("confirmation.subject", headerSafe(confirmation.venueName())),
				copy.text("confirmation.opening") + PARAGRAPH + block + PARAGRAPH + copy.text("confirmation.closing")
						+ disclosureLine(copy, confirmation.cancellationWindowAtBirth(),
								confirmation.lateCancelRefundBps())
						+ supportLines(copy));
	}

	@Override
	public void sendStayConfirmation(String toEmail, SiteLocale locale, StayConfirmationMail confirmation) {
		MailCopy copy = MailCopy.in(locale);
		String block = copy.block(widthOf(BOOKING_ROWS, ROW_PAID), List.of(
				new Row(ROW_BOOKING_CODE, confirmation.bookingCode()),
				new Row(ROW_VENUE, confirmation.venueName()),
				copy.daysRow(confirmation.firstDate(), confirmation.lastDate()),
				new Row(ROW_PAID, copy.amount(confirmation.amountMinor(), confirmation.currency()))));
		String stops = confirmation.stops().stream()
				.map(stop -> "  %s:  %s".formatted(copy.span(stop.firstDate(), stop.lastDate()),
						copy.text(SPOT, stop.rowLabel(), String.valueOf(stop.positionNo()))))
				.collect(Collectors.joining("\n"));
		send(toEmail, copy.text("stayConfirmation.subject", headerSafe(confirmation.venueName())),
				copy.text("stayConfirmation.opening") + PARAGRAPH + block + PARAGRAPH
						+ copy.text("stayConfirmation.spotChanges") + PARAGRAPH + stops + PARAGRAPH
						+ copy.text("stayConfirmation.closing")
						+ disclosureLine(copy, confirmation.cancellationWindowAtBirth(),
								confirmation.lateCancelRefundBps())
						+ supportLines(copy));
	}

	/** The configured support channels under a blank line, one per line; empty when none is configured. */
	private String supportLines(MailCopy copy) {
		if (!support.hasChannel()) {
			return "";
		}
		List<Row> channels = new ArrayList<>();
		support.email().ifPresent(email -> channels.add(new Row("support.email", email)));
		support.whatsappNumber().ifPresent(number -> channels.add(new Row("support.whatsapp",
				number + " (" + support.whatsappLink().orElseThrow() + ")")));
		return PARAGRAPH + copy.text("support.heading") + "\n"
				+ copy.block(List.of("support.email", "support.whatsapp"), channels);
	}

	@Override
	public void sendBookingCancellation(String toEmail, SiteLocale locale, BookingCancellationMail cancellation) {
		MailCopy copy = MailCopy.in(locale);
		List<Row> rows = new ArrayList<>(List.of(
				new Row("row.booking", cancellation.bookingCode()),
				new Row(ROW_VENUE, cancellation.venueName()),
				copy.daysRow(cancellation.bookingDate(), cancellation.lastDate())));
		String after;
		if (cancellation.refundMinor() > 0) {
			rows.add(new Row(ROW_REFUND, copy.amount(cancellation.refundMinor(), cancellation.currency())));
			after = copy.text("refund.onItsWay");
		}
		else {
			after = copy.text(cancellation.rebookLink() != null ? "cancellation.nothingCharged" : "cancellation.noRefund");
		}
		String block = copy.block(List.of("row.booking", ROW_VENUE, ROW_DATE, ROW_DAYS, ROW_REFUND), rows);
		send(toEmail, copy.text("cancellation.subject", headerSafe(cancellation.venueName())),
				opening(copy, cancellation) + PARAGRAPH + block + PARAGRAPH + after + rebookLine(copy, cancellation));
	}

	/**
	 * Why the booking ended, in the tourist's terms. Exhaustive over the published enum with no {@code default}, so a
	 * new {@code RefundReason} is a compile error here rather than a blank first line in someone's inbox.
	 */
	private static String opening(MailCopy copy, BookingCancellationMail cancellation) {
		return switch (cancellation.reason()) {
			case POLICY -> copy.text("cancellation.opening.policy");
			case WEATHER -> copy.text("cancellation.opening.weather", copy.date(cancellation.bookingDate()));
			case VENUE -> copy.text("cancellation.opening.venue", cancellation.venueName(),
					copy.date(cancellation.bookingDate()));
			case CONFLICT -> copy.text("cancellation.opening.conflict");
			case VENUE_CHANGE -> venueChangeOpening(copy, cancellation);
		};
	}

	/** A rebook link marks the venue's own remodel; without one the guest took the free exit a move earned them. */
	private static String venueChangeOpening(MailCopy copy, BookingCancellationMail cancellation) {
		if (cancellation.rebookLink() == null) {
			return copy.text("cancellation.opening.freeExit");
		}
		return copy.text(cancellation.refundMinor() > 0
				? "cancellation.opening.remodelRefunded"
				: "cancellation.opening.remodelReleased");
	}

	/** The way back a venue-caused cancellation owes: that venue's map for the day, or the day's list. */
	private static String rebookLine(MailCopy copy, BookingCancellationMail cancellation) {
		if (cancellation.rebookLink() == null) {
			return "";
		}
		return PARAGRAPH + copy.text("cancellation.rebook") + "\n" + cancellation.rebookLink();
	}

	@Override
	public void sendPaymentDue(String toEmail, SiteLocale locale, PaymentDueMail paymentDue) {
		MailCopy copy = MailCopy.in(locale);
		String block = copy.block(widthOf(BOOKING_ROWS, "row.toPay", "row.payBy"), List.of(
				new Row(ROW_BOOKING_CODE, paymentDue.bookingCode()),
				new Row(ROW_VENUE, paymentDue.venueName()),
				copy.daysRow(paymentDue.bookingDate(), paymentDue.lastDate()),
				new Row("row.toPay", copy.amount(paymentDue.amountMinor(), paymentDue.currency())),
				new Row("row.payBy", copy.deadline(paymentDue.payBy()))));
		send(toEmail, copy.text("paymentDue.subject", headerSafe(paymentDue.venueName())),
				copy.text("paymentDue.opening", paymentDue.venueName()) + PARAGRAPH + block + PARAGRAPH
						+ copy.text("paymentDue.payHere") + PARAGRAPH + paymentDue.payLink() + PARAGRAPH
						+ copy.text("paymentDue.closing")
						+ disclosureLine(copy, paymentDue.cancellationWindowAtBirth(), paymentDue.lateCancelRefundBps()));
	}

	/**
	 * The born-past-free-cancellation line, matching the checkout note. Only CLOSED may say the booking can't be
	 * cancelled: LATE stays cancellable (invariant #10). FREE or null renders nothing (payloads lacking the field).
	 */
	private static String disclosureLine(MailCopy copy, CancellationWindow windowAtBirth, int lateCancelRefundBps) {
		if (windowAtBirth == null || windowAtBirth == CancellationWindow.FREE) {
			return "";
		}
		if (windowAtBirth == CancellationWindow.LATE) {
			return PARAGRAPH + (lateCancelRefundBps > 0
					? copy.text("disclosure.latePartial", copy.percent(lateCancelRefundBps))
					: copy.text("disclosure.lateNone"));
		}
		return PARAGRAPH + copy.text("disclosure.closed");
	}

	@Override
	public void sendBookingMoved(String toEmail, SiteLocale locale, BookingMovedMail moved) {
		MailCopy copy = MailCopy.in(locale);
		boolean oneDay = moved.bookingDate().equals(moved.lastDate());
		String block = copy.block(widthOf(BOOKING_ROWS, "row.yourSpot"), List.of(
				new Row(ROW_BOOKING_CODE, moved.bookingCode()),
				new Row(ROW_VENUE, moved.venueName()),
				copy.daysRow(moved.bookingDate(), moved.lastDate()),
				new Row("row.yourSpot", copy.text(ROW_SPOT, moved.toRowLabel(), String.valueOf(moved.toPositionNo())))));
		send(toEmail, copy.text("moved.subject", headerSafe(moved.venueName())),
				copy.text("moved.opening", moved.venueName(), moved.toRowLabel() + moved.toPositionNo(),
						moved.fromRowLabel() + moved.fromPositionNo(),
						distance(copy, moved.rowsAway(), moved.positionsAway()))
						+ "\n" + copy.text(oneDay ? "moved.unchangedDate" : "moved.unchangedDays") + PARAGRAPH
						+ block + PARAGRAPH + freeExitLine(copy, moved) + PARAGRAPH + moved.bookingLink());
	}

	@Override
	public void sendMoveReminder(String toEmail, SiteLocale locale, MoveReminderMail reminder) {
		MailCopy copy = MailCopy.in(locale);
		String block = copy.block(List.of(ROW_BOOKING_CODE, ROW_VENUE, "row.tomorrow", "row.until"), List.of(
				new Row(ROW_BOOKING_CODE, reminder.bookingCode()),
				new Row(ROW_VENUE, reminder.venueName()),
				new Row("row.tomorrow", copy.text(ROW_SPOT, reminder.toRowLabel(), String.valueOf(reminder.toPositionNo()))),
				new Row("row.until", copy.date(reminder.stayLastDate()))));
		String to = reminder.toRowLabel() + reminder.toPositionNo();
		String distance = distance(copy, reminder.rowsAway(), reminder.positionsAway());
		// "instead of today's A1" only while the guest holds today on that set; a refunded day is not today's spot (#1381).
		String opening = reminder.fromDayHeld()
				? copy.text("moveReminder.openingHeld", copy.date(reminder.moveDate()), reminder.venueName(), to,
						reminder.fromRowLabel() + reminder.fromPositionNo(), distance)
				: copy.text("moveReminder.opening", copy.date(reminder.moveDate()), reminder.venueName(), to, distance);
		send(toEmail, copy.text("moveReminder.subject", headerSafe(reminder.venueName())),
				opening + "\n" + copy.text("moveReminder.staff") + PARAGRAPH + block + PARAGRAPH
						+ copy.text("moveReminder.yourStay") + PARAGRAPH + reminder.bookingLink());
	}

	@Override
	public void sendDayRefund(String toEmail, SiteLocale locale, DayRefundMail refund) {
		MailCopy copy = MailCopy.in(locale);
		String block = copy.block(List.of(ROW_BOOKING_CODE, ROW_VENUE, "row.refundedDay", ROW_REFUND), List.of(
				new Row(ROW_BOOKING_CODE, refund.bookingCode()),
				new Row(ROW_VENUE, refund.venueName()),
				new Row("row.refundedDay", copy.date(refund.serviceDate())),
				new Row(ROW_REFUND, copy.amount(refund.refundMinor(), refund.currency()))));
		send(toEmail, copy.text("dayRefund.subject", headerSafe(refund.venueName())),
				dayRefundOpening(copy, refund) + PARAGRAPH + block + PARAGRAPH + copy.text("refund.onItsWay")
						+ PARAGRAPH + refund.bookingLink());
	}

	/**
	 * Who refunded the day and what becomes of the spot: weather keeps it the guest's (ADR-0026 §3); the venue's own
	 * refund frees it when released, and names no grounds (ADR-0027 §9). Exhaustive: a reason without copy won't compile.
	 */
	private static String dayRefundOpening(MailCopy copy, DayRefundMail refund) {
		String day = copy.date(refund.serviceDate());
		return switch (refund.reason()) {
			case WEATHER -> copy.text("dayRefund.weather", refund.venueName(), day);
			case VENUE -> copy.text(refund.released() ? "dayRefund.venueReleased" : "dayRefund.venue",
					refund.venueName(), day);
			case POLICY, CONFLICT, VENUE_CHANGE -> throw new IllegalArgumentException(
					"a day is refunded for weather or by the venue, not " + refund.reason());
		};
	}

	/** The exit a move earned: in full for a lone booking, these days in full for a stretch, none once the judged day opened. */
	private static String freeExitLine(MailCopy copy, BookingMovedMail moved) {
		if (moved.freeExitUntil() == null) {
			return copy.text("moved.freeExitClosed");
		}
		String until = copy.deadline(moved.freeExitUntil());
		return copy.text(moved.stretch() ? "moved.freeExitStretch" : "moved.freeExitLone", until);
	}

	/** "4 positions along the row", "1 row over", "2 rows and 3 positions away". */
	static String distance(MailCopy copy, int rowsAway, int positionsAway) {
		String positions = copy.text("count.positions", positionsAway);
		if (rowsAway == 0) {
			return copy.text("distance.alongRow", positions);
		}
		String rows = copy.text("count.rows", rowsAway);
		if (positionsAway == 0) {
			return copy.text("distance.rowsOver", rows);
		}
		return copy.text("distance.away", rows, positions);
	}

	@Override
	public void sendRequestDeclined(String toEmail, SiteLocale locale, RequestDeclinedMail declined) {
		MailCopy copy = MailCopy.in(locale);
		send(toEmail, copy.text("declined.subject", headerSafe(declined.venueName())),
				declineLine(copy, declined) + PARAGRAPH + bookingBlock(copy, declined.bookingCode(), declined.venueName(),
						copy.daysRow(declined.bookingDate(), declined.lastDate()))
						+ PARAGRAPH + copy.text("request.seeHere") + PARAGRAPH + declined.statusLink());
	}

	/** The one line that says why the request ended (ADR-0025). */
	private static String declineLine(MailCopy copy, RequestDeclinedMail declined) {
		return switch (declined.reason()) {
			case VENUE -> copy.text("declined.venue", declined.venueName());
			case SET_UNAVAILABLE -> copy.text(declined.bookingDate().equals(declined.lastDate())
					? "declined.setUnavailableDay" : "declined.setUnavailableDays", declined.venueName());
			case ANOTHER_GUEST -> copy.text("declined.anotherGuest", declined.venueName());
		};
	}

	@Override
	public void sendRequestExpired(String toEmail, SiteLocale locale, RequestExpiredMail expired) {
		MailCopy copy = MailCopy.in(locale);
		send(toEmail, copy.text("expired.subject", headerSafe(expired.venueName())),
				copy.text("expired.opening") + PARAGRAPH + bookingBlock(copy, expired.bookingCode(), expired.venueName(),
						copy.daysRow(expired.bookingDate(), expired.lastDate()))
						+ PARAGRAPH + copy.text("request.seeHere") + PARAGRAPH + expired.statusLink());
	}

	private static String bookingBlock(MailCopy copy, String bookingCode, String venueName, Row days) {
		return copy.block(BOOKING_ROWS, List.of(new Row(ROW_BOOKING_CODE, bookingCode), new Row(ROW_VENUE, venueName), days));
	}

	@Override
	public void sendOperatorApproved(String toEmail, SiteLocale locale, URI signInLink) {
		MailCopy copy = MailCopy.in(locale);
		send(toEmail, copy.text("operatorApproved.subject"), copy.text("operatorApproved.body", signInLink.toString()));
	}

	private static List<String> widthOf(List<String> base, String... more) {
		List<String> keys = new ArrayList<>(base);
		keys.addAll(List.of(more));
		return keys;
	}

	/**
	 * Strips CR/LF from operator-supplied text bound for a <em>header</em>. Keep it though Jakarta Mail refuses a
	 * newline in a subject today ({@code SmtpMailerIT} passes either way): it starts mattering under
	 * {@code MimeMessageHelper}, a raw header API or the provider's HTTP API. Bodies need none.
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
