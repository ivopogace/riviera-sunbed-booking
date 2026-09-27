package ai.riviera.platform.booking;

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
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

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
