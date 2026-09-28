package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Two stay requests contesting two {@code (set, date)} rows are accepted at once (#1267, invariant #2):
 * exactly one stay is accepted, the other is declined whole, every contested row is claimed once, and
 * the loser leaves no day behind. Both accepts claim in ascending day order, so they cannot deadlock.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class ConcurrentStayAcceptIT {

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	JdbcClient jdbc;

	private StayFixtures.Venue venue;
	private OperatorId owner;

	@BeforeEach
	void seed() {
		venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		owner = StayFixtures.ownerOf(jdbc, venue);
	}

	@AfterEach
	void clean() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	@RepeatedTest(3)
	void exactlyOneStayWinsAndTheLoserHoldsNothing() throws Exception {
		LocalDate d0 = StayFixtures.firstDay();
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		Instant expires = Instant.now().plusSeconds(3600);
		String tag = String.valueOf(System.nanoTime() % 100_000_000L);
		StayFixtures.SeededStay x = StayFixtures.insertPendingStay(jdbc, venue, "CSX" + tag, d0, a, 2, b, 2, expires);
		StayFixtures.SeededStay y = StayFixtures.insertPendingStay(jdbc, venue, "CSY" + tag, d0.plusDays(1), a, 2, b, 2,
				expires);
		CountDownLatch gate = new CountDownLatch(1);
		Callable<AcceptOutcome> acceptX = () -> {
			gate.await();
			return respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(x.id()));
		};
		Callable<AcceptOutcome> acceptY = () -> {
			gate.await();
			return respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(y.id()));
		};
		List<AcceptOutcome> outcomes;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<AcceptOutcome> fx = pool.submit(acceptX);
			Future<AcceptOutcome> fy = pool.submit(acceptY);
			gate.countDown();
			outcomes = List.of(fx.get(), fy.get());
		}

		assertEquals(1, outcomes.stream().filter(AcceptOutcome.Accepted.class::isInstance).count(),
				"exactly one stay wins: " + outcomes);
		List<String> xStatuses = statuses(x);
		List<String> yStatuses = statuses(y);
		List<String> winner = xStatuses.getFirst().equals("CONFIRMED") ? xStatuses : yStatuses;
		List<String> loser = winner == xStatuses ? yStatuses : xStatuses;
		assertEquals(List.of("CONFIRMED", "CONFIRMED"), winner, "the stub confirms the winner whole");
		assertEquals(List.of("DECLINED", "DECLINED"), loser, "the loser is declined whole");
		assertEquals(4L, StayFixtures.heldDays(jdbc, a, d0, d0.plusDays(5)) + StayFixtures.heldDays(jdbc, b, d0,
				d0.plusDays(5)), "the winner's four days, one row each, nothing of the loser's");
	}

	private List<String> statuses(StayFixtures.SeededStay stay) {
		return stay.stretches().stream().map(id -> StayFixtures.statusOf(jdbc, id)).toList();
	}
}
