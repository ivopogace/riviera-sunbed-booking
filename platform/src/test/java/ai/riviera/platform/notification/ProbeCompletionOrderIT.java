package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.Advised;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/** Scratch probe for #1465 candidate 1 — not committed. */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ControllableMailerConfiguration.class })
@SpringBootTest
class ProbeCompletionOrderIT {

	@Autowired ControllableMailer transport;
	@Autowired JdbcClient jdbc;
	@Autowired ApplicationEventPublisher publisher;
	@Autowired PlatformTransactionManager txManager;
	@Autowired ApplicationContext context;

	private BookingMailFixtures fixtures;

	@BeforeEach
	void reset() {
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
		transport.reset();
	}

	@Test
	void advisorChain() {
		Object listener = context.getBean("requestExpiredMailListener");
		List<String> chain = Arrays.stream(((Advised) listener).getAdvisors())
				.map(a -> a.getClass().getName()).toList();
		int async = indexOf(chain, "AsyncAnnotationAdvisor");
		int completion = indexOf(chain, "CompletionRegisteringAdvisor");
		assertThat(async).as("advisor chain %s", chain).isNotNegative().isLessThan(completion);
	}

	@Test
	void wedgedSendLeavesThePublicationLive() {
		BookingMailFixtures.SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2033, 1, 14);
		String guest = "probe-wedge@example.com";
		long bookingId = fixtures.seedBooking(set, "PROBEW01", date, guest, 33_014L, "EXPIRED");
		transport.block();
		fixtures.publishInTransaction(fixtures.requestExpiredOf(set, bookingId, date));

		Awaitility.await().atMost(Duration.ofSeconds(15)).until(() -> transport.attemptsMatching(guest) == 1);
		Awaitility.await().during(Duration.ofSeconds(3)).atMost(Duration.ofSeconds(5))
				.until(() -> archived(date) == 0L);
		String live = jdbc.sql("SELECT status || ':' || coalesce(completion_date::text, 'null') FROM event_publication "
				+ "WHERE serialized_event LIKE :f AND listener_id = :l")
				.param("f", "%" + date + "%").param("l", BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID)
				.query(String.class).single();
		assertThat(live).as("the live row while the send is wedged").startsWith("PROCESSING:null");
		assertThat(transport.deliveriesMatching(guest)).isZero();

		transport.release();
		Awaitility.await().atMost(Duration.ofSeconds(15)).until(() -> archived(date) == 1L);
		assertThat(transport.deliveriesMatching(guest)).isEqualTo(1);
	}

	private static int indexOf(List<String> chain, String simpleName) {
		for (int i = 0; i < chain.size(); i++) {
			if (chain.get(i).endsWith("." + simpleName)) {
				return i;
			}
		}
		return -1;
	}

	private long archived(LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM event_publication_archive WHERE serialized_event LIKE :f AND listener_id = :l")
				.param("f", "%" + date + "%").param("l", BookingMailFixtures.REQUEST_EXPIRED_LISTENER_ID)
				.query(Long.class).single();
	}
}
