package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.application.remodel.NewReceipt;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcome;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link BookingNotificationFacts}' stay reads: what the stay confirmation mail renders — the stay's
 * code (never a row code, invariant #7), the guest contact, each stop in day order, the summed total —
 * reachable by the stay's id and by any stretch's booking id; a lone booking has none. Real Postgres via
 * Testcontainers, the stub gateway.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class StayConfirmationFactsIT {

	@Autowired
	CreateStay createStay;

	@Autowired
	BookingNotificationFacts facts;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	RemodelReceipts receipts;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	@Test
	void aConfirmedStayResolvesEveryStopByItsIdAndByAnyStretch() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();
		StayOutcome.Confirmed confirmed = assertInstanceOf(StayOutcome.Confirmed.class,
				createStay.create(plan(a, 3, b, 4, first)));
		long stay = jdbc.sql("SELECT id FROM stay WHERE venue_id = :v").param("v", venue.id()).query(Long.class).single();
		List<Long> stretches = jdbc.sql("SELECT id FROM booking WHERE stay_id = :s ORDER BY booking_date")
				.param("s", stay).query(Long.class).list();
		long customer = jdbc.sql("SELECT customer_id FROM booking WHERE id = :b").param("b", stretches.get(0))
				.query(Long.class).single();

		StayConfirmationFacts byStay = facts.stayConfirmationFacts(new StayId(stay)).orElseThrow();

		assertEquals(new StayConfirmationFacts(new StayId(stay), confirmed.confirmation().code(), new CustomerId(customer),
				List.of(new StayConfirmationFacts.Stop(new BookingId(stretches.get(0)), a, first, first.plusDays(2)),
						new StayConfirmationFacts.Stop(new BookingId(stretches.get(1)), b, first.plusDays(3),
								first.plusDays(6))),
				7 * PRICE, "EUR", true, CancellationWindow.FREE, 0), byStay);
		assertEquals(first, byStay.firstDate());
		assertEquals(first.plusDays(6), byStay.lastDate());
		assertEquals(byStay, facts.stayConfirmationFactsOf(new BookingId(stretches.get(1))).orElseThrow(),
				"any stretch resolves its stay");
	}

	@Test
	void theCancellationFactsAreTheLiveRemainderOrTheWholeStayWhenNothingIsLive() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();
		createStay.create(plan(a, 3, b, 4, first));
		StayId stay = new StayId(jdbc.sql("SELECT id FROM stay WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single());
		List<Long> stretches = jdbc.sql("SELECT id FROM booking WHERE stay_id = :s ORDER BY booking_date")
				.param("s", stay.value()).query(Long.class).list();
		StayConfirmationFacts whole = facts.stayConfirmationFacts(stay).orElseThrow();
		assertEquals(whole, facts.stayCancellationFacts(stay).orElseThrow(), "nothing set aside: the whole stay");

		endByRemodel(venue, a, stretches.get(0), first);

		StayConfirmationFacts remainder = facts.stayCancellationFacts(stay).orElseThrow();
		assertEquals(List.of(whole.stops().get(1)), remainder.stops(), "the stretch a remodel ended is set aside");
		assertEquals(4 * PRICE, remainder.amountMinor(), "the remainder's own amount");
		assertEquals(whole.code(), remainder.code());
		assertEquals(whole, facts.stayConfirmationFacts(stay).orElseThrow(), "the confirmation read stays whole");

		endByRemodel(venue, b, stretches.get(1), first.plusDays(3));

		assertEquals(whole, facts.stayCancellationFacts(stay).orElseThrow(), "nothing live: the whole stay");
		assertTrue(facts.stayCancellationFacts(new StayId(-1)).isEmpty());
	}

	/** #1381: a confirmed stretch with every day refunded is set aside too, so the stay's cancellation mail names the rest. */
	@Test
	void aStretchWithNothingLeftLeavesTheCancellationFacts() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		createStay.create(plan(venue.online().get(0), 3, venue.online().get(1), 4, first));
		StayId stay = new StayId(jdbc.sql("SELECT id FROM stay WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single());
		long spent = jdbc.sql("SELECT id FROM booking WHERE stay_id = :s ORDER BY booking_date LIMIT 1")
				.param("s", stay.value()).query(Long.class).single();
		StayConfirmationFacts whole = facts.stayConfirmationFacts(stay).orElseThrow();

		jdbc.sql("UPDATE booking_day SET refunded_at = now(), refund_minor = :m, refund_reason = 'WEATHER' WHERE booking_id = :b")
				.param("m", PRICE).param("b", spent).update();

		StayConfirmationFacts remainder = facts.stayCancellationFacts(stay).orElseThrow();
		assertEquals(List.of(whole.stops().get(1)), remainder.stops());
		assertEquals(4 * PRICE, remainder.amountMinor());
		assertEquals(whole, facts.stayConfirmationFacts(stay).orElseThrow(), "the confirmation read stays whole");
	}

	/** What a remodel commit leaves on a stretch it refunded: the stretch cancelled and a receipt outcome line. */
	private void endByRemodel(Venue venue, SetId set, long stretch, LocalDate date) {
		jdbc.sql("UPDATE booking SET status = 'CANCELLED', cancelled_at = now() WHERE id = :id").param("id", stretch)
				.update();
		receipts.store(new NewReceipt(new VenueId(venue.id()), StayFixtures.ownerOf(jdbc, venue), Instant.now(), List.of(),
				List.of(new ReceiptOutcome(new BookingId(stretch), date, new SpotRef(set, "A", 1),
						ReceiptOutcomeKind.REFUND, PRICE, "EUR", 0L)),
				"row rebuilt", List.of()));
	}

	@Test
	void aStayWithAStretchStillAwaitingPaymentIsNotEverConfirmed() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		createStay.create(plan(venue.online().get(0), 2, venue.online().get(1), 2, firstDay()));
		long stay = jdbc.sql("SELECT id FROM stay WHERE venue_id = :v").param("v", venue.id()).query(Long.class).single();
		jdbc.sql("UPDATE booking SET confirmed_at = NULL WHERE stay_id = :s AND booking_date = :d")
				.param("s", stay).param("d", firstDay()).update();

		assertFalse(facts.stayConfirmationFacts(new StayId(stay)).orElseThrow().everConfirmed());
	}

	@Test
	void aLoneBookingAndAnUnknownStayHaveNoStayFacts() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES ('lone-facts@example.com', "
				+ "'Guest', '+355600') RETURNING id").query(Long.class).single();
		long lone = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency,
				                     status)
				VALUES (:code, :v, :set, :c, :d, 4500, 'EUR', 'CONFIRMED') RETURNING id
				""").param("code", "LONEF" + System.nanoTime()).param("v", venue.id())
				.param("set", venue.online().get(0).value()).param("c", customer).param("d", firstDay())
				.query(Long.class).single();

		assertTrue(facts.stayConfirmationFactsOf(new BookingId(lone)).isEmpty());
		assertTrue(facts.stayConfirmationFacts(new StayId(-1)).isEmpty());
	}
}
