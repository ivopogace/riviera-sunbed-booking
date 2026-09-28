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
import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.statusOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * A remodel that disturbs any stretch of a pending stay request declines the whole stay
 * {@code SET_UNAVAILABLE} (#1267, ADR-0025 §4): one {@link StayRequestDeclined}, a receipt line per
 * disturbed stretch, and none of its stretches declined alone.
 */
@RecordApplicationEvents
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class RemodelStayRequestIT {

	@Autowired
	RemodelClaims remodelClaims;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private StayFixtures.Venue venue;
	private OperatorId owner;
	private VenueId venueId;
	private StayFixtures.SeededStay stay;

	@BeforeEach
	void seed() {
		venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		owner = StayFixtures.ownerOf(jdbc, venue);
		venueId = new VenueId(venue.id());
		LocalDate first = StayFixtures.firstDay();
		stay = StayFixtures.insertPendingStay(jdbc, venue, "RSR" + System.nanoTime() % 100_000_000L, first,
				venue.online().get(0), 2, venue.online().get(1), 2, Instant.now().plusSeconds(3600));
	}

	@AfterEach
	void clean() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	private void commitDisturbing(List<SetId> disturbed) {
		List<RemodelClaim> claims = remodelClaims.classify(owner, venueId, disturbed);
		assertInstanceOf(RemodelCommit.Applied.class,
				remodelClaims.commit(owner, venueId, disturbed, PreviewToken.of(claims), RefundConfirmation.NONE));
	}

	@Test
	void disturbingOneStretchDeclinesTheWholeStay() {
		commitDisturbing(List.of(venue.online().get(1)));

		for (long id : stay.stretches()) {
			assertEquals("DECLINED", statusOf(jdbc, id), "the undisturbed stretch goes with its stay");
		}
		assertEquals(List.of(new StayRequestDeclined(new StayId(stay.id()), DeclineReason.SET_UNAVAILABLE)),
				events.stream(StayRequestDeclined.class).toList());
		assertEquals(0L, events.stream(BookingRequestDeclined.class).count());
		assertEquals(List.of(stay.stretches().get(1)), declineLines());
	}

	@Test
	void disturbingEveryStretchDeclinesTheStayOnce() {
		commitDisturbing(List.of(venue.online().get(0), venue.online().get(1)));

		for (long id : stay.stretches()) {
			assertEquals("DECLINED", statusOf(jdbc, id));
		}
		assertEquals(1L, events.stream(StayRequestDeclined.class).count());
		assertEquals(stay.stretches(), declineLines(), "one receipt line per disturbed stretch");
	}

	private List<Long> declineLines() {
		return jdbc.sql("""
				SELECT o.booking_id FROM remodel_receipt_outcome o JOIN remodel_receipt r ON r.id = o.receipt_id
				WHERE r.venue_id = :v AND o.kind = 'DECLINE' ORDER BY o.booking_id
				""").param("v", venue.id()).query(Long.class).list();
	}
}
