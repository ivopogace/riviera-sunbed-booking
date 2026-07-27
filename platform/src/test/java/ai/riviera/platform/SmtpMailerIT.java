package ai.riviera.platform;

import java.net.URI;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.GreenMailUtil;
import com.icegreen.greenmail.util.ServerSetupTest;

import jakarta.mail.internet.MimeMessage;

import static org.assertj.core.api.Assertions.assertThat;

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
	void neverLogsTheTokenizedLink(CapturedOutput output) {
		mailer().sendEmailVerification(TO, LINK);
		mailer().sendPasswordReset(TO, LINK);

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
