package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.statusOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * The venue answers a stay request whole (#1267): a stretch is never accepted or declined on its own.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class StayRequestAcceptIT {

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	JdbcClient jdbc;

	private StayFixtures.Venue venue;
	private OperatorId owner;
	private LocalDate first;

	@BeforeEach
	void seed() {
		venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		owner = StayFixtures.ownerOf(jdbc, venue);
		first = StayFixtures.firstDay();
	}

	@AfterEach
	void clean() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	private StayFixtures.SeededStay pendingStay(String code) {
		return StayFixtures.insertPendingStay(jdbc, venue, code, first, venue.online().get(0), 2,
				venue.online().get(1), 2, Instant.now().plusSeconds(3600));
	}

	@Test
	void aStretchIsNeverAnsweredAlone() {
		StayFixtures.SeededStay stay = pendingStay("SRQA" + System.nanoTime() % 100_000_000L);
		VenueId venueId = new VenueId(venue.id());
		BookingId stretch = new BookingId(stay.stretches().getFirst());

		assertSame(AcceptOutcome.Rejected.NO_SUCH_REQUEST, respondToRequest.accept(owner, venueId, stretch));
		assertSame(DeclineOutcome.Rejected.NO_SUCH_REQUEST, respondToRequest.decline(owner, venueId, stretch));
		for (long id : stay.stretches()) {
			assertEquals("PENDING_REQUEST", statusOf(jdbc, id));
		}
		assertEquals(0L, StayFixtures.heldDays(jdbc, venue.online().get(0), first, first.plusDays(3)));
	}
}
