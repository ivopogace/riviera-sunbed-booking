package ai.riviera.platform.notification.adapter.out;

import java.net.ServerSocket;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.GreenMailUtil;
import com.icegreen.greenmail.util.ServerSetupTest;

import jakarta.mail.internet.MimeMessage;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.PaymentDueMail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Integration spec for the real {@link SmtpMailer} (#368, ADR-0011) against an in-JVM SMTP sink
 * (GreenMail) — no live provider, no Docker. Proves the AC-1/2/7 contract: each send delivers exactly
 * one plain-text message to the right recipient with the right subject and the tokenized link exactly
 * as handed in, with no HTML/tracking markup, and the link (a bearer credential, invariant #7) never
 * reaches the log output at the transport layer.
 */
@ExtendWith(OutputCaptureExtension.class)
class SmtpMailerIT {

	private static final String TO = "tourist@example.com";
	private static final String FROM = "noreply@test.local";
	private static final URI LINK = URI.create("https://app.example/account/verify?token=s3cret-t0ken");
	private static final String BOOKING_CODE = "XK4T9PQ2";

	private static final URI PAY_LINK = URI.create("https://app.example/booking/" + BOOKING_CODE);

	/** 18:30 UTC = 20:30 in Tirane on a summer date (CEST) — the gap is what the assertion reads. */
	private static final Instant DEADLINE = Instant.parse("2026-08-14T18:30:00Z");

	private static final BookingConfirmationMail CONFIRMATION = new BookingConfirmationMail(
			BOOKING_CODE, "Miramar Beach", LocalDate.of(2026, 8, 15), "A", 3, 2500, "EUR");

	@RegisterExtension
	static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.SMTP);

	@Test
	void deliversVerificationEmailOverSmtp() throws Exception {
		mailer().sendEmailVerification(TO, LINK);

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(GreenMailUtil.getAddressList(message.getAllRecipients())).isEqualTo(TO);
		assertThat(GreenMailUtil.getAddressList(message.getFrom())).isEqualTo(FROM);
		assertThat(GreenMailUtil.getHeaders(message)).contains("Subject: Verify your email");
		assertPlainTextWithLink(message);
	}

	@Test
	void deliversPasswordResetEmailOverSmtp() throws Exception {
		mailer().sendPasswordReset(TO, LINK);

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(GreenMailUtil.getAddressList(message.getAllRecipients())).isEqualTo(TO);
		assertThat(GreenMailUtil.getHeaders(message)).contains("Subject: Reset your password");
		assertPlainTextWithLink(message);
	}

	@Test
	void deliversBookingConfirmationOverSmtp() throws Exception {
		mailer().sendBookingConfirmation(TO, CONFIRMATION);

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(GreenMailUtil.getAddressList(message.getAllRecipients())).isEqualTo(TO);
		assertThat(GreenMailUtil.getAddressList(message.getFrom())).isEqualTo(FROM);
		assertThat(GreenMailUtil.getHeaders(message))
				.as("the arrival code stays out of the subject — subjects surface in lock-screen "
						+ "previews and mail-client list views (invariant #7)")
				.contains("Subject: Your booking at Miramar Beach is confirmed")
				.doesNotContain(BOOKING_CODE);

		assertThat(message.isMimeType("text/plain")).as("plain text, no HTML/tracking (ADR-0011)").isTrue();
		String body = message.getContent().toString();
		assertThat(body).contains(BOOKING_CODE, "Miramar Beach", "15 August 2026", "Row A, position 3",
				"EUR 25.00");
		assertThat(body).doesNotContain("<html", "<img", "http://track", "utm_");
	}

	@Test
	void neverLogsTheBookingCode(CapturedOutput output) {
		mailer().sendBookingConfirmation(TO, CONFIRMATION);

		assertThat(output).doesNotContain(BOOKING_CODE);
	}

	// ---- the cancellation/refund kind (#374, Email S6) ---------------------------------------

	/**
	 * AC-1/AC-4/AC-10 at the transport: one plain-text message, the refund rendered from integer minor
	 * units, no tracking markup — and the arrival code in the body as the booking's reference but never
	 * in the subject, which surfaces in lock-screen previews (invariant #7, the confirmation's rule).
	 */
	@Test
	void rendersTheRefundFromMinorUnits() throws Exception {
		mailer().sendBookingCancellation(TO, cancellation(2500, RefundReason.POLICY));

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(GreenMailUtil.getAddressList(message.getAllRecipients())).isEqualTo(TO);
		assertThat(GreenMailUtil.getAddressList(message.getFrom())).isEqualTo(FROM);
		assertThat(GreenMailUtil.getHeaders(message))
				.contains("Subject: Your booking at Miramar Beach is cancelled")
				.doesNotContain(BOOKING_CODE);

		String body = message.getContent().toString();
		assertThat(body).contains(BOOKING_CODE, "Miramar Beach", "15 August 2026", "EUR 25.00");
	}

	/**
	 * 2500 minor units is EUR 25.00 and 2505 is EUR 25.05 — the second is what catches an
	 * integer-division or {@code /100.0} regression, which the round number alone would not.
	 */
	@Test
	void rendersAnAmountWithNonZeroCents() throws Exception {
		mailer().sendBookingCancellation(TO, cancellation(2505, RefundReason.POLICY));

		assertThat(theOnlyReceivedMessage().getContent().toString()).contains("EUR 25.05");
	}

	/**
	 * AC-2: cancelled after the cutoff, ADR-0005 tier {@code NONE}. Stating "EUR 0.00" would be
	 * technically true and read as a refund, so the copy has to say the opposite in words — and name
	 * no amount at all, which is what the currency assertion pins.
	 */
	@Test
	void rendersNoRefundWhenNothingIsReturned() throws Exception {
		mailer().sendBookingCancellation(TO, cancellation(0, RefundReason.POLICY));

		String body = theOnlyReceivedMessage().getContent().toString();
		assertThat(body).doesNotContain("EUR");
		assertThat(body).containsIgnoringCase("no refund");
	}

	/**
	 * AC-3: the one event feeds both cancellation channels, so the body is what tells a tourist which
	 * happened. A weather cancellation is one they never asked for; the two must not read alike.
	 */
	@Test
	void namesTheCancellationReason() throws Exception {
		mailer().sendBookingCancellation(TO, cancellation(2500, RefundReason.POLICY));
		String policyBody = theOnlyReceivedMessage().getContent().toString();
		greenMail.reset();

		mailer().sendBookingCancellation(TO, cancellation(2500, RefundReason.WEATHER));
		String weatherBody = theOnlyReceivedMessage().getContent().toString();

		assertThat(policyBody).containsIgnoringCase("your cancellation").doesNotContainIgnoringCase("weather");
		assertThat(weatherBody).containsIgnoringCase("weather");
		assertThat(weatherBody).isNotEqualTo(policyBody);
	}

	/**
	 * Every reason renders — including {@code CONFLICT}, which the V14 CHECK admits but v1 never
	 * issues. The transport switches exhaustively so a fourth constant is a compile error, but nothing
	 * makes the third produce sensible copy except a spec that reads it.
	 */
	@Test
	void everyRefundReasonRendersABody() throws Exception {
		for (RefundReason reason : RefundReason.values()) {
			greenMail.reset();
			mailer().sendBookingCancellation(TO, cancellation(2500, reason));

			String body = theOnlyReceivedMessage().getContent().toString();
			assertThat(body).as("body for %s", reason).isNotBlank().contains("Miramar Beach");
		}
	}

	@Test
	void carriesNoTrackingMarkup() throws Exception {
		mailer().sendBookingCancellation(TO, cancellation(2500, RefundReason.WEATHER));

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(message.isMimeType("text/plain")).as("plain text, no HTML/tracking (ADR-0011)").isTrue();
		assertThat(message.getContent().toString()).doesNotContain("<html", "<img", "http://track", "utm_");
	}

	@Test
	void neverLogsTheBookingCodeOnACancellation(CapturedOutput output) {
		mailer().sendBookingCancellation(TO, cancellation(2500, RefundReason.POLICY));

		assertThat(output).doesNotContain(BOOKING_CODE);
	}

	// ---- the payment-due kind (#373, Email S5) -----------------------------------------------

	/**
	 * AC-5 at the transport: the deadline, the amount and the pay link all reach the body, and the
	 * deadline is stated in {@code Europe/Tirane} (invariant #6) rather than in UTC or the JVM default.
	 *
	 * <p>The instant chosen is deliberately one where those differ and the choice is visible: 18:30 UTC
	 * is 20:30 in Tirane on a summer date (CEST, UTC+2). A transport that rendered the raw instant
	 * would print 18:30 and pass every other assertion here — so the hour is the assertion.
	 */
	@Test
	void statesThePayDeadlineInTiraneWithThePayLink() throws Exception {
		mailer().sendPaymentDue(TO, paymentDue());

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(GreenMailUtil.getAddressList(message.getAllRecipients())).isEqualTo(TO);
		assertThat(GreenMailUtil.getAddressList(message.getFrom())).isEqualTo(FROM);
		// getSubject() decodes the RFC-2047 encoded-word any non-ASCII subject becomes.
		assertThat(message.getSubject()).isEqualTo("Miramar Beach accepted your request — payment due");
		assertThat(GreenMailUtil.getHeaders(message)).doesNotContain(BOOKING_CODE);

		String body = message.getContent().toString();
		assertThat(body).contains(BOOKING_CODE, "Miramar Beach", "15 August 2026", "EUR 25.00");
		assertThat(body).as("the deadline in Europe/Tirane, not UTC").contains("14 August 2026 at 20:30");
		assertThat(body).contains(PAY_LINK.toString());
	}

	@Test
	void thePaymentDueMailCarriesNoTrackingMarkup() throws Exception {
		mailer().sendPaymentDue(TO, paymentDue());

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(message.isMimeType("text/plain")).as("plain text, no HTML/tracking (ADR-0011)").isTrue();
		assertThat(message.getContent().toString()).doesNotContain("<html", "<img", "http://track", "utm_");
	}

	/**
	 * Invariant #7 twice over: the arrival code, and the pay link that embeds it. The link is the one
	 * this transport must be most careful with — a recovery link at least expires on use.
	 */
	@Test
	void neverLogsTheCodeOrThePayLink(CapturedOutput output) {
		mailer().sendPaymentDue(TO, paymentDue());

		assertThat(output).doesNotContain(BOOKING_CODE);
		assertThat(output).doesNotContain(PAY_LINK.toString());
	}

	private static PaymentDueMail paymentDue() {
		return new PaymentDueMail(BOOKING_CODE, "Miramar Beach", LocalDate.of(2026, 8, 15),
				DEADLINE, 2500, "EUR", PAY_LINK);
	}

	private static BookingCancellationMail cancellation(long refundMinor, RefundReason reason) {
		return new BookingCancellationMail(BOOKING_CODE, "Miramar Beach", LocalDate.of(2026, 8, 15),
				refundMinor, "EUR", reason);
	}

	/**
	 * The operator-approval notice (#375). Asserted through the same lens as every other kind — one
	 * plain-text message, right recipient, right subject, the link exactly as handed in — because the
	 * one thing that differs about this kind (its link is public, not a bearer credential) changes
	 * nothing the transport is responsible for.
	 */
	@Test
	void deliversOperatorApprovedEmailOverSmtp() throws Exception {
		URI signInLink = URI.create("https://app.example/account/sign-in");
		mailer().sendOperatorApproved(TO, signInLink);

		MimeMessage message = theOnlyReceivedMessage();
		assertThat(GreenMailUtil.getAddressList(message.getAllRecipients())).isEqualTo(TO);
		assertThat(GreenMailUtil.getHeaders(message)).contains("Subject: Your operator account is approved");
		assertThat(message.isMimeType("text/plain")).as("plain text, no HTML/tracking (ADR-0011)").isTrue();
		String body = message.getContent().toString();
		assertThat(body).contains(signInLink.toString());
		assertThat(body).doesNotContain("<html", "<img", "http://track", "utm_");
	}

	@Test
	void aVenueNameCarryingNewlinesCannotInjectHeaders() throws Exception {
		BookingConfirmationMail injected = new BookingConfirmationMail(BOOKING_CODE,
				"Evil\r\nBcc: attacker@example.com\r\nX-Injected: yes", LocalDate.of(2026, 8, 15),
				"A", 3, 2500, "EUR");

		mailer().sendBookingConfirmation(TO, injected);

		// Pins the property, not one layer's implementation of it: this passes with or without
		// SmtpMailer.headerSafe, because Jakarta Mail already refuses to promote a newline in a subject
		// to a new header. It exists to fail if that ever stops being true — a move to MimeMessageHelper,
		// a raw header API, or ADR-0011's deferred HTTP API would each put it back in play.
		MimeMessage message = theOnlyReceivedMessage();
		assertThat(message.getHeader("Bcc")).isNull();
		assertThat(message.getHeader("X-Injected")).isNull();
		assertThat(GreenMailUtil.getAddressList(message.getAllRecipients())).isEqualTo(TO);
		assertThat(message.getSubject()).doesNotContain("\r", "\n");
	}

	@Test
	void aFailedBookingConfirmationThrowsWithoutLoggingTheCode(CapturedOutput output) throws Exception {
		int closedPort;
		try (ServerSocket socket = new ServerSocket(0)) {
			closedPort = socket.getLocalPort();
		}
		JavaMailSenderImpl sender = new JavaMailSenderImpl();
		sender.setHost("127.0.0.1");
		sender.setPort(closedPort);
		sender.getJavaMailProperties().setProperty("mail.smtp.connectiontimeout", "2000");

		// The failure must propagate: BookingConfirmationMailListener relies on it to leave the
		// publication outstanding so a restart retries. Swallowing here would silently turn the
		// registry's at-least-once contract into fire-and-forget.
		assertThatThrownBy(() -> new SmtpMailer(sender, FROM).sendBookingConfirmation(TO, CONFIRMATION))
				.isInstanceOf(MailException.class);
		assertThat(output).doesNotContain(BOOKING_CODE);
	}

	@Test
	void neverLogsTheTokenizedLink(CapturedOutput output) {
		mailer().sendEmailVerification(TO, LINK);
		mailer().sendPasswordReset(TO, LINK);

		assertThat(output).doesNotContain("s3cret-t0ken");
	}

	@Test
	void aFailedSendThrowsWithoutLoggingTheTokenizedLink(CapturedOutput output) throws Exception {
		int closedPort;
		try (ServerSocket socket = new ServerSocket(0)) {
			closedPort = socket.getLocalPort();
		}
		JavaMailSenderImpl sender = new JavaMailSenderImpl();
		sender.setHost("127.0.0.1");
		sender.setPort(closedPort);
		sender.getJavaMailProperties().setProperty("mail.smtp.connectiontimeout", "2000");
		SmtpMailer mailer = new SmtpMailer(sender, FROM);

		// The exception propagates to the caller (CustomerRecovery.dispatchQuietly logs only its class name).
		assertThatThrownBy(() -> mailer.sendEmailVerification(TO, LINK)).isInstanceOf(MailException.class);
		assertThat(output).doesNotContain("s3cret-t0ken");
	}

	private static SmtpMailer mailer() {
		JavaMailSenderImpl sender = new JavaMailSenderImpl();
		sender.setHost("127.0.0.1");
		sender.setPort(greenMail.getSmtp().getPort());
		return new SmtpMailer(sender, FROM);
	}

	private static MimeMessage theOnlyReceivedMessage() {
		MimeMessage[] received = greenMail.getReceivedMessages();
		assertThat(received).hasSize(1);
		return received[0];
	}

	private static void assertPlainTextWithLink(MimeMessage message) throws Exception {
		assertThat(message.isMimeType("text/plain")).as("plain text, no HTML/tracking (ADR-0011)").isTrue();
		String body = message.getContent().toString();
		assertThat(body).contains(LINK.toString());
		assertThat(body).doesNotContain("<html", "<img", "http://track", "utm_");
	}
}
