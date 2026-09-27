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
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.application.reserve.ConfirmBooking;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.events.StayConfirmed;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * {@link StayConfirmed} is published once per stay, by the confirm that leaves no stretch unconfirmed,
 * and each stretch's {@link BookingConfirmed} names its stay; a lone booking's names none. Records the
 * events published on the test thread; the concurrent-webhook case is {@code StayConfirmationMailIT}'s,
 * observed through the registry. Real Postgres via Testcontainers, the stub gateway.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@RecordApplicationEvents
class StayConfirmedPublicationIT {

	@Autowired
	CreateStay createStay;

	@Autowired
	ConfirmBooking confirmBooking;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	private Venue venue() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		return venue;
	}

	@Test
	void aStayConfirmedInOneGoPublishesOneStayConfirmed() {
		Venue venue = venue();
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);

		StayOutcome outcome = createStay.create(plan(a, 3, b, 4, firstDay()));

		assertInstanceOf(StayOutcome.Confirmed.class, outcome);
		long stayId = jdbc.sql("SELECT id FROM stay WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single();
		assertEquals(List.of(new StayConfirmed(new StayId(stayId), CancellationWindow.FREE, 0)),
				events.stream(StayConfirmed.class).toList());
		assertEquals(List.of(new StayId(stayId), new StayId(stayId)),
				events.stream(BookingConfirmed.class).map(BookingConfirmed::stayId).toList(),
				"each stretch's BookingConfirmed names its stay");
	}

	@Test
	void onlyTheConfirmThatCompletesTheStayPublishesIt() {
		Venue venue = venue();
		LocalDate first = firstDay();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES ('webhook-stay@example.com', "
				+ "'Guest', '+355600') RETURNING id").query(Long.class).single();
		long stay = jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:code, :v, :first, :last) RETURNING id
				""").param("code", "WHSTAY" + System.nanoTime()).param("v", venue.id()).param("first", first)
				.param("last", first.plusDays(3)).query(Long.class).single();
		long firstStretch = awaitingStretch(venue.id(), venue.online().get(0), customer, stay, first, first.plusDays(1), 1);
		long secondStretch = awaitingStretch(venue.id(), venue.online().get(1), customer, stay, first.plusDays(2),
				first.plusDays(3), 2);

		confirmBooking.confirmFromPayment(secondStretch, Instant.now());
		assertEquals(List.of(), events.stream(StayConfirmed.class).toList(), "one stretch still awaits payment");

		confirmBooking.confirmFromPayment(firstStretch, Instant.now());
		assertEquals(List.of(new StayConfirmed(new StayId(stay), CancellationWindow.FREE, 0)),
				events.stream(StayConfirmed.class).toList());

		confirmBooking.confirmFromPayment(firstStretch, Instant.now());
		assertEquals(1, events.stream(StayConfirmed.class).count(), "a re-delivered confirm publishes nothing");
	}

	@Test
	void aLoneBookingNamesNoStay() {
		Venue venue = venue();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES ('lone@example.com', "
				+ "'Guest', '+355600') RETURNING id").query(Long.class).single();
		LocalDate day = firstDay();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status)
				VALUES (:code, :v, :set, :c, :d, :d, 4500, 'EUR', 'AWAITING_PAYMENT') RETURNING id
				""").param("code", "LONE" + System.nanoTime()).param("v", venue.id())
				.param("set", venue.online().get(2).value()).param("c", customer).param("d", day)
				.query(Long.class).single();

		confirmBooking.confirmFromPayment(booking, Instant.now());

		assertNull(events.stream(BookingConfirmed.class).findFirst().orElseThrow().stayId());
		assertEquals(0, events.stream(StayConfirmed.class).count());
	}

	private long awaitingStretch(long venue, SetId set, long customer, long stay, LocalDate first, LocalDate last, int n) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, stay_id)
				VALUES ((SELECT code FROM stay WHERE id = :stay) || '-' || :n, :v, :set, :c, :first, :last, 9000, 'EUR',
				        'AWAITING_PAYMENT', :stay)
				RETURNING id
				""").param("stay", stay).param("n", n).param("v", venue).param("set", set.value()).param("c", customer)
				.param("first", first).param("last", last).query(Long.class).single();
	}
}
