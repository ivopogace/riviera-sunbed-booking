package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import io.micrometer.core.instrument.MeterRegistry;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.notification.application.TransactionalMailService;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Scratch probe for #1465 candidate 2 plus a read-once reproduction, in RequestExpiredMailIT's exact
 * context key. Not for merge.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ProbeMailerIdentityIT {

	@Autowired MockMailer mailer;
	@Autowired ApplicationContext context;
	@Autowired JdbcClient jdbc;
	@Autowired ApplicationEventPublisher publisher;
	@Autowired PlatformTransactionManager txManager;
	@Autowired MeterRegistry meters;

	private BookingMailFixtures fixtures;

	@BeforeEach
	void isolate() {
		mailer.clear();
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
	}

	@Test
	void theServiceSendsThroughTheAutowiredMockMailer() {
		Object held = ReflectionTestUtils.getField(context.getBean(TransactionalMailService.class), "mailer");
		assertThat(held).as("mailers %s", context.getBeansOfType(Mailer.class).keySet()).isSameAs(mailer);
	}

	/** The pre-#1458 shape: await the archive row, then read the mail once. */
	@RepeatedTest(40)
	void archiveThenReadOnce(RepetitionInfo repetition) {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2034, 1, 1).plusDays(repetition.getCurrentRepetition());
		String guest = "probe-once-" + repetition.getCurrentRepetition() + "@example.com";
		double abandonedBefore = abandoned();

		long bookingId = fixtures.seedBooking(set, "PRB" + (10_000 + repetition.getCurrentRepetition()), date,
				guest, 34_000L + repetition.getCurrentRepetition(), "EXPIRED");
		fixtures.publishInTransaction(fixtures.requestExpiredOf(set, bookingId, date));

		Awaitility.await().atMost(Duration.ofSeconds(15)).until(() -> !archived(date).isEmpty());
		assertThat(mailer.lastTo(guest))
				.as("mail after archive %s; abandoned delta %s; all recipients %s", archived(date),
						abandoned() - abandonedBefore, mailer.sent().stream().map(e -> e.toEmail()).toList())
				.isPresent();
	}

	private List<String> archived(LocalDate date) {
		return jdbc.sql("SELECT listener_id FROM event_publication_archive WHERE event_type = :t "
				+ "AND serialized_event LIKE :f AND listener_id = :l")
				.param("t", ai.riviera.platform.booking.events.BookingRequestExpired.class.getName())
				.param("f", "%" + date + "%").param("l", BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID)
				.query(String.class).list();
	}

	private double abandoned() {
		return meters.find(ObservabilityMetrics.MAIL_REQUEST_EXPIRED_ABANDONED).counters().stream()
				.mapToDouble(c -> c.count()).sum();
	}
}
