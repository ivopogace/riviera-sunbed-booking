package ai.riviera.platform.notification.application;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;

import ai.riviera.platform.booking.vocabulary.BookingId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * The one policy both writers of the delivery log share (#380): stamp the clock, and let the
 * <em>evidence</em> give way if the write itself fails.
 *
 * <p>That asymmetry is the whole subject of this class, and it is worth a test rather than a comment
 * because getting it backwards has a concrete cost. By the time this runs the mail has already been
 * handed to the transport (or deliberately withheld); propagating a failed insert from the automatic
 * path would abort a listener that had already sent, leaving the publication outstanding and mailing
 * the tourist a second time on the registry's next retry — trading a missing history row for a
 * duplicate mail.
 *
 * <p>The catch is narrow on purpose. A {@code DataAccessException} is the failure this trade is argued
 * for; a programming error above it is not something to absorb (`riviera-java-conventions` §6), and the
 * last spec pins that distinction so a future widening to {@code RuntimeException} turns red.
 */
class ConfirmationAttemptRecorderTest {

	private static final BookingId BOOKING_ID = new BookingId(42L);
	private static final Instant NOW = Instant.parse("2026-07-30T09:31:00Z");

	private final ConfirmationMailAttempts attempts = mock(ConfirmationMailAttempts.class);
	private final ConfirmationAttemptRecorder recorder =
			new ConfirmationAttemptRecorder(attempts, Clock.fixed(NOW, ZoneOffset.UTC));

	private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
	private ch.qos.logback.classic.Logger logger;

	@BeforeEach
	void captureLogs() {
		logger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(ConfirmationAttemptRecorder.class);
		logged.start();
		logger.addAppender(logged);
	}

	@AfterEach
	void releaseLogs() {
		logger.detachAppender(logged);
		logged.stop();
	}

	@Test
	void appendsTheAttemptStampedWithTheApplicationClock() {
		recorder.recordAttempt(BOOKING_ID, MailAttemptSource.ADMIN_RESEND, MailAttemptOutcome.SENT);

		verify(attempts).append(new MailAttempt(BOOKING_ID, MailAttemptSource.ADMIN_RESEND,
				MailAttemptOutcome.SENT, NOW));
	}

	@Test
	void absorbsAFailedWriteRatherThanFailingTheSendThatAlreadyHappened() {
		doThrow(new DataAccessResourceFailureException("db gone")).when(attempts).append(any());

		assertThatCode(() -> recorder.recordAttempt(BOOKING_ID, MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.SENT)).doesNotThrowAnyException();
	}

	/** A swallowed write with no line would be a silent loss of the evidence — the ids say which booking. */
	@Test
	void warnsWithTheIdsAndNoCredentialWhenTheWriteFails() {
		doThrow(new DataAccessResourceFailureException("db gone")).when(attempts).append(any());

		recorder.recordAttempt(BOOKING_ID, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.TRANSPORT_FAILED);

		assertThat(logged.list).hasSize(1);
		assertThat(logged.list.getFirst().getLevel()).isEqualTo(Level.WARN);
		assertThat(logged.list.getFirst().getFormattedMessage())
				.contains(String.valueOf(BOOKING_ID.value()))
				.contains(MailAttemptOutcome.TRANSPORT_FAILED.name());
	}

	/**
	 * The limit of the absorption: a defect in the mapping above this call is not a database failure and
	 * must not be hidden behind the same {@code WARN}.
	 */
	@Test
	void doesNotAbsorbAProgrammingError() {
		doThrow(new IllegalStateException("bug")).when(attempts).append(any());

		assertThatThrownBy(() -> recorder.recordAttempt(BOOKING_ID, MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.SENT)).isInstanceOf(IllegalStateException.class);
	}
}
