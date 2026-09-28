package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.ExpireRequests;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.events.StayRequestExpired;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.statusOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * The venue's decline and the expiry sweep end a stay request whole (#1267): every stretch moves, one
 * stay-level fact is published, and no stretch publishes its own.
 */
@RecordApplicationEvents
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class StayRequestDeclineIT {

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	ExpireRequests expireRequests;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

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

	private StayFixtures.SeededStay pendingStay(String prefix, Instant expires) {
		return StayFixtures.insertPendingStay(jdbc, venue, prefix + System.nanoTime() % 100_000_000L, first,
				venue.online().get(0), 2, venue.online().get(1), 2, expires);
	}

	@Test
	void theVenueDeclinesAStayWhole() {
		StayFixtures.SeededStay stay = pendingStay("SDCA", Instant.now().plusSeconds(3600));
		VenueId venueId = new VenueId(venue.id());

		assertInstanceOf(DeclineOutcome.Declined.class, respondToRequest.declineStay(owner, venueId, new StayId(stay.id())));

		for (long id : stay.stretches()) {
			assertEquals("DECLINED", statusOf(jdbc, id));
		}
		assertEquals(List.of(new StayRequestDeclined(new StayId(stay.id()), DeclineReason.VENUE)),
				events.stream(StayRequestDeclined.class).toList());
		assertEquals(0L, events.stream(BookingRequestDeclined.class).count());
		assertSame(DeclineOutcome.Rejected.NOT_PENDING,
				respondToRequest.declineStay(owner, venueId, new StayId(stay.id())));
		assertSame(DeclineOutcome.Rejected.NO_SUCH_REQUEST,
				respondToRequest.declineStay(owner, venueId, new StayId(Long.MAX_VALUE)));
	}

	@Test
	void theSweepExpiresAStayWholeAndSaysSoOnce() {
		StayFixtures.SeededStay stay = pendingStay("SEXA", Instant.now().minusSeconds(60));

		expireRequests.sweep();

		for (long id : stay.stretches()) {
			assertEquals("EXPIRED", statusOf(jdbc, id));
		}
		assertEquals(List.of(new StayRequestExpired(new StayId(stay.id()))),
				events.stream(StayRequestExpired.class).filter(e -> e.stayId().value() == stay.id()).toList());
		assertEquals(0L, events.stream(BookingRequestExpired.class)
				.filter(e -> stay.stretches().contains(e.bookingId().value())).count());
	}
}
