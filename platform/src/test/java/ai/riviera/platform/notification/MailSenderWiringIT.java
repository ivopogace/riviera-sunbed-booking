package ai.riviera.platform.notification;

import java.net.URI;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.PostgresContainerConfiguration;
import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The fire-and-forget contract, proven on the <strong>real wiring</strong>.
 *
 * <p>"A recovery send does no mail work on the caller's thread" is the structural closure of the
 * timing account-enumeration oracle, and until this test it was proven only half-by-half, never
 * end-to-end: {@code CustomerRecoveryTest} mocks {@link MailSender} entirely,
 * {@code TransactionalMailServiceTest} proves the class in isolation with a capturing dispatcher, and
 * every DB-backed IT installs the {@code @Primary} synchronous dispatcher. A future decorating or
 * {@code @Primary} {@link MailSender} that did its I/O inline would pass all three while re-opening
 * the oracle — the gap the post-merge review fan-out flagged.
 *
 * <p>So this test deliberately takes the <strong>full component-scanned context</strong> and
 * {@link PostgresContainerConfiguration} rather than {@code TestcontainersConfiguration}, opting out
 * of the synchronous override on purpose. A hand-listed {@code @SpringBootTest(classes = …)} slice
 * would defeat the point: it would not contain a future decorator, so it could not catch one.
 *
 * <p>Only the transport is stubbed, and only to observe which thread it lands on — the dispatcher,
 * the chokepoint service, the suppression adapter and its real database read are all the production
 * beans, so the assertion covers the whole path the edge actually gets.
 */
@EnabledIfDockerAvailable
@Import({ PostgresContainerConfiguration.class, MailSenderWiringIT.RecordingTransport.class })
@SpringBootTest
class MailSenderWiringIT {

	private static final URI LINK = URI.create("https://riviera.example/account/reset?token=wiring");
	private static final int AWAIT_SECONDS = 10;

	@Autowired
	MailSender mailSender;

	@Autowired
	RecordingMailer transport;

	@Test
	void theEdgeInjectedMailSenderDispatchesOffTheCallersThread() throws Exception {
		String callerThread = Thread.currentThread().getName();

		mailSender.sendPasswordReset("wiring-proof@example.com", LINK);

		assertThat(transport.awaitSend(AWAIT_SECONDS))
				.as("the send never reached the transport — the wiring is broken, not merely synchronous")
				.isTrue();
		assertThat(transport.sendThread())
				.as("the MailSender bean the edge receives did its work on the CALLER's thread; that is the "
						+ "#369 timing oracle re-opened — check for a decorating or @Primary MailSender")
				.isNotEqualTo(callerThread)
				.startsWith("recovery-mail-");
	}

	/** Overrides the recording mock only to capture the thread; everything else stays production wiring. */
	@TestConfiguration(proxyBeanMethods = false)
	static class RecordingTransport {

		@Bean
		@Primary
		RecordingMailer recordingMailer() {
			return new RecordingMailer();
		}
	}

	/**
	 * Records the thread the transport ran on. The suppression read runs inside the same dispatched
	 * task, immediately before this, so a send observed here is proof the whole task — DB read
	 * included — left the caller's thread.
	 */
	static class RecordingMailer implements Mailer {

		private final CountDownLatch sent = new CountDownLatch(1);
		private final AtomicReference<String> sendThread = new AtomicReference<>();

		boolean awaitSend(int seconds) throws InterruptedException {
			return sent.await(seconds, TimeUnit.SECONDS);
		}

		String sendThread() {
			return sendThread.get();
		}

		@Override
		public void sendPasswordReset(String toEmail, URI resetLink) {
			record();
		}

		@Override
		public void sendEmailVerification(String toEmail, URI verificationLink) {
			record();
		}

		@Override
		public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
			record();
		}

		@Override
		public void sendBookingCancellation(String toEmail, BookingCancellationMail cancellation) {
			record();
		}

		@Override
		public void sendPaymentDue(String toEmail, PaymentDueMail paymentDue) {
			record();
		}

		@Override
		public void sendRequestDeclined(String toEmail, RequestDeclinedMail declined) {
			record();
		}

		@Override
		public void sendRequestExpired(String toEmail, RequestExpiredMail expired) {
			record();
		}

		@Override
		public void sendOperatorApproved(String toEmail, URI signInLink) {
			record();
		}

		private void record() {
			sendThread.set(Thread.currentThread().getName());
			sent.countDown();
		}
	}
}
