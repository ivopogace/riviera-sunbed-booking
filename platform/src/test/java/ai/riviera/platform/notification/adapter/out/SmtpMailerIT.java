package ai.riviera.platform.notification.adapter.out;

import java.net.ServerSocket;
import java.net.URI;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.notification.application.BookingConfirmationMail;
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
