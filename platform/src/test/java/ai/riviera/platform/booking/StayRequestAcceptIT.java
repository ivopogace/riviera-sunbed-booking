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
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.StayConfirmed;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.statusOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * The venue answers a stay request whole (#1267): a stretch is never accepted or declined on its own,
 * the accept claims every day of every stretch or none (invariant #2), and a rival request that is
 * itself a stay declines whole. Stub gateway: an accepted stay confirms synchronously.
 */
@RecordApplicationEvents
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

	@Test
	void acceptClaimsEveryStretchAndCollectsOnce() {
		StayFixtures.SeededStay stay = pendingStay("SRQB" + System.nanoTime() % 100_000_000L);

		AcceptOutcome outcome = respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(stay.id()));

		assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		for (long id : stay.stretches()) {
			assertEquals("CONFIRMED", statusOf(jdbc, id), "the stub collects the whole stay synchronously");
		}
		assertEquals(2L, StayFixtures.heldDays(jdbc, venue.online().get(0), first, first.plusDays(3)));
		assertEquals(2L, StayFixtures.heldDays(jdbc, venue.online().get(1), first, first.plusDays(3)));
		assertEquals(1L, events.stream(StayConfirmed.class).count(), "one stay, confirmed once");
		assertEquals(0L, events.stream(BookingPaymentDue.class).count());
	}

	@Test
	void aLostDayDeclinesTheWholeStay() {
		StayFixtures.SeededStay stay = pendingStay("SRQC" + System.nanoTime() % 100_000_000L);
		StayFixtures.take(jdbc, venue.online().get(1), first.plusDays(3));

		AcceptOutcome outcome = respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(stay.id()));

		assertSame(AcceptOutcome.Rejected.SET_UNAVAILABLE, outcome);
		for (long id : stay.stretches()) {
			assertEquals("DECLINED", statusOf(jdbc, id));
			assertEquals("SET_UNAVAILABLE", declineReasonOf(id));
		}
		assertEquals(0L, StayFixtures.heldDays(jdbc, venue.online().get(0), first, first.plusDays(3)),
				"the first stretch's days are given back");
		assertEquals(1L, StayFixtures.heldDays(jdbc, venue.online().get(1), first, first.plusDays(3)),
				"only the day taken beforehand stays held");
		assertEquals(java.util.List.of(new StayRequestDeclined(new StayId(stay.id()), DeclineReason.SET_UNAVAILABLE)),
				events.stream(StayRequestDeclined.class).toList());
	}

	@Test
	void rivalStaysDeclineWhole() {
		String tag = String.valueOf(System.nanoTime() % 100_000_000L);
		StayFixtures.SeededStay stay = pendingStay("SRQD" + tag);
		Instant expires = Instant.now().plusSeconds(3600);
		StayFixtures.SeededStay rivalStay = StayFixtures.insertPendingStay(jdbc, venue, "SRQE" + tag, first.plusDays(3),
				venue.online().get(1), 1, venue.online().get(2), 3, expires);
		long rivalLone = StayFixtures.insertPendingLone(jdbc, venue, "SRQF" + tag, venue.online().get(0), first, first,
				expires);
		long bystander = StayFixtures.insertPendingLone(jdbc, venue, "SRQG" + tag, venue.online().get(2), first, first,
				expires);

		respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(stay.id()));

		for (long id : rivalStay.stretches()) {
			assertEquals("DECLINED", statusOf(jdbc, id), "a rival stay declines whole, even off the clash");
			assertEquals("ANOTHER_GUEST", declineReasonOf(id));
		}
		assertEquals("DECLINED", statusOf(jdbc, rivalLone));
		assertEquals("PENDING_REQUEST", statusOf(jdbc, bystander), "no overlap, no rival");
		assertEquals(java.util.List.of(new StayRequestDeclined(new StayId(rivalStay.id()), DeclineReason.ANOTHER_GUEST)),
				events.stream(StayRequestDeclined.class).toList(), "one fact per rival stay");
		assertEquals(java.util.List.of(rivalLone), events.stream(BookingRequestDeclined.class)
				.map(declined -> declined.bookingId().value()).toList());
	}

	@Test
	void aLoneAcceptDeclinesARivalStayWhole() {
		String tag = String.valueOf(System.nanoTime() % 100_000_000L);
		StayFixtures.SeededStay rivalStay = pendingStay("SRQH" + tag);
		long lone = StayFixtures.insertPendingLone(jdbc, venue, "SRQI" + tag, venue.online().get(1), first.plusDays(3),
				first.plusDays(3), Instant.now().plusSeconds(3600));

		assertInstanceOf(AcceptOutcome.Accepted.class,
				respondToRequest.accept(owner, new VenueId(venue.id()), new BookingId(lone)));

		for (long id : rivalStay.stretches()) {
			assertEquals("DECLINED", statusOf(jdbc, id));
		}
		assertEquals(1L, events.stream(StayRequestDeclined.class).count());
		assertEquals(0L, events.stream(BookingRequestDeclined.class).count(), "a stay's stretch mails nothing alone");
	}

	private String declineReasonOf(long bookingId) {
		return jdbc.sql("SELECT decline_reason FROM booking WHERE id = :id").param("id", bookingId)
				.query(String.class).optional().orElse(null);
	}
}
