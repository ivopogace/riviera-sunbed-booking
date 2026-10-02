package ai.riviera.platform.booking;

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
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.StayCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.heldDays;
import static ai.riviera.platform.booking.StayFixtures.statusOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A remodel that releases one unpaid stretch of a stitched stay ends the stay's other unpaid stretches with it
 * (#1292, ADR-0024 decision 3: one intent for the group): the preview names both as releases, the commit cancels
 * both, frees every day of both spans once (#2), receipts a {@code RELEASE} line each (what the void listener and
 * the guest cancel read), stamps each {@code BookingCancelled} with the stay and publishes one {@code StayCancelled}
 * with no refund. A stay with a confirmed stretch left keeps it, and the released stretch mails on its own.
 */
@RecordApplicationEvents
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class RemodelReleaseStayIT {

	@Autowired
	RemodelClaims remodelClaims;

	@Autowired
	RemodelReceipts receipts;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private StayFixtures.Venue venue;
	private OperatorId owner;
	private VenueId venueId;
	private LocalDate first;

	@BeforeEach
	void seedVenue() {
		venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		owner = StayFixtures.ownerOf(jdbc, venue);
		venueId = new VenueId(venue.id());
		first = StayFixtures.firstDay();
	}

	@AfterEach
	void clean() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	/** A stay of two stretches, {@code daysOnA} on the first online set then {@code daysOnB} on the second, holding its days. */
	private StayFixtures.SeededStay seedHeldStay(String statusA, int daysOnA, String statusB, int daysOnB) {
		StayFixtures.SeededStay stay = StayFixtures.insertStay(jdbc, venue, "RRS" + System.nanoTime() % 100_000_000L,
				first, venue.online().get(0), daysOnA, statusA, venue.online().get(1), daysOnB, statusB);
		for (int day = 0; day < daysOnA; day++) {
			StayFixtures.take(jdbc, venue.online().get(0), first.plusDays(day));
		}
		for (int day = 0; day < daysOnB; day++) {
			StayFixtures.take(jdbc, venue.online().get(1), first.plusDays(daysOnA + day));
		}
		return stay;
	}

	/** Hold every other online set on the first stretch's days, so the disturbed stretch has no move candidate. */
	private void holdEveryCandidateOnTheFirstStretch(int daysOnA) {
		for (int day = 0; day < daysOnA; day++) {
			StayFixtures.take(jdbc, venue.online().get(1), first.plusDays(day));
			StayFixtures.take(jdbc, venue.online().get(2), first.plusDays(day));
		}
	}

	@Test
	void disturbingOneUnpaidStretchEndsTheStay() {
		StayFixtures.SeededStay stay = seedHeldStay("AWAITING_PAYMENT", 2, "AWAITING_PAYMENT", 2);
		holdEveryCandidateOnTheFirstStretch(2);
		List<SetId> disturbed = List.of(venue.online().get(0));

		List<RemodelClaim> picture = remodelClaims.classify(owner, venueId, disturbed);

		assertEquals(stay.stretches().stream().map(BookingId::new).toList(),
				picture.stream().map(RemodelClaim::bookingId).toList(), "the undisturbed stretch is in the picture");
		assertTrue(picture.stream().allMatch(claim -> claim.outcome() == RemodelOutcome.Release.RELEASE));
		assertEquals(venue.online().get(1), picture.get(1).from().setId(), "on its own spot");

		RemodelCommit outcome = remodelClaims.commit(owner, venueId, disturbed, PreviewToken.of(picture),
				RefundConfirmation.NONE);

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		for (long id : stay.stretches()) {
			assertEquals("CANCELLED", statusOf(jdbc, id));
			assertTrue(receipts.releasedByRemodel(new BookingId(id)), "the void listener sees a release line for " + id);
			assertTrue(receipts.endedByRemodel(new BookingId(id)));
		}
		assertEquals(0L, heldDays(jdbc, venue.online().get(0), first, first.plusDays(3)));
		assertEquals(0L, heldDays(jdbc, venue.online().get(1), first.plusDays(2), first.plusDays(3)),
				"every day of every stretch is released");
		assertEquals(2L, heldDays(jdbc, venue.online().get(1), first, first.plusDays(1)), "nobody else's rows move");
		assertEquals(2L, heldDays(jdbc, venue.online().get(2), first, first.plusDays(3)));
		assertEquals(List.of("RELEASE", "RELEASE"), outcomeKinds(stay.stretches()));
		List<BookingCancelled> cancelled = events.stream(BookingCancelled.class).toList();
		assertEquals(2, cancelled.size(), "one BookingCancelled per stretch");
		assertTrue(cancelled.stream().allMatch(event -> event.refundMinor() == 0
				&& event.reason() == RefundReason.VENUE_CHANGE && new StayId(stay.id()).equals(event.cancelledWithStay())),
				"each stretch names the stay it ends with, so its own mail is left to the stay's");
		assertEquals(List.of(new StayCancelled(new StayId(stay.id()), 0, "EUR", RefundReason.VENUE_CHANGE)),
				events.stream(StayCancelled.class).toList(), "one stay mail, no refund, the venue's change");
	}

	@Test
	void aStayWithAConfirmedStretchKeepsItAndTheReleasedStretchMailsAlone() {
		StayFixtures.SeededStay stay = seedHeldStay("AWAITING_PAYMENT", 2, "CONFIRMED", 2);
		holdEveryCandidateOnTheFirstStretch(2);
		List<SetId> disturbed = List.of(venue.online().get(0));
		long unpaid = stay.stretches().get(0);
		long paid = stay.stretches().get(1);

		List<RemodelClaim> picture = remodelClaims.classify(owner, venueId, disturbed);
		assertEquals(List.of(new BookingId(unpaid)), picture.stream().map(RemodelClaim::bookingId).toList());
		assertInstanceOf(RemodelCommit.Applied.class,
				remodelClaims.commit(owner, venueId, disturbed, PreviewToken.of(picture), RefundConfirmation.NONE));

		assertEquals("CANCELLED", statusOf(jdbc, unpaid));
		assertEquals("CONFIRMED", statusOf(jdbc, paid), "a paid stretch is never released with an unpaid one");
		assertEquals(0L, heldDays(jdbc, venue.online().get(0), first, first.plusDays(1)));
		assertEquals(2L, heldDays(jdbc, venue.online().get(1), first.plusDays(2), first.plusDays(3)));
		assertEquals(List.of("RELEASE"), outcomeKinds(stay.stretches()));
		List<BookingCancelled> cancelled = events.stream(BookingCancelled.class).toList();
		assertEquals(1, cancelled.size());
		assertNull(cancelled.getFirst().cancelledWithStay(), "the stay goes on, so the stretch mails alone");
		assertEquals(0L, events.stream(StayCancelled.class).count());
	}

	private List<String> outcomeKinds(List<Long> bookingIds) {
		return jdbc.sql("""
				SELECT o.kind FROM remodel_receipt_outcome o JOIN remodel_receipt r ON r.id = o.receipt_id
				WHERE r.venue_id = :v AND o.booking_id IN (:ids) ORDER BY o.booking_id
				""").param("v", venue.id()).param("ids", bookingIds).query(String.class).list();
	}
}
