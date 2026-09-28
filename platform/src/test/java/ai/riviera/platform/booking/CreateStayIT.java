package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.ConfirmBooking;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.CreateStayCommand;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.venue.vocabulary.SetId;

import static ai.riviera.platform.booking.StayFixtures.GUEST;
import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.heldDays;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static ai.riviera.platform.booking.StayFixtures.take;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * A stitched stay through {@link CreateStay} against the stub gateway: one stay row with the group's
 * code, one booking per stretch under it (row codes derived, never the stay's), every day of every
 * stretch claimed (invariant #2), one {@code BookingConfirmed} per stretch (payout accrues per
 * stretch, story 40), and the same refusals a single booking gets, each writing nothing. Real
 * Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@RecordApplicationEvents
class CreateStayIT {

	@Autowired
	CreateStay createStay;

	@MockitoSpyBean
	ConfirmBooking confirmBooking;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> jdbc.sql(
				"SELECT count(*) FROM event_publication WHERE completion_date IS NULL").query(Long.class).single() == 0L);
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	private Venue venue(String mode, Integer maxStayDays, boolean visible) {
		Venue venue = StayFixtures.venue(jdbc, mode, maxStayDays, visible);
		venues.add(venue.id());
		return venue;
	}

	@Test
	void reservesEveryStretchUnderOneCodeAndConfirmsEach() {
		Venue venue = venue("INSTANT", null, true);
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();

		StayOutcome outcome = createStay.create(plan(a, 3, b, 4, first));

		StayOutcome.Confirmed confirmed = assertInstanceOf(StayOutcome.Confirmed.class, outcome);
		String code = confirmed.confirmation().code();
		assertEquals(10, code.length(), "the stay's code is the guest's one credential");
		assertEquals(7 * PRICE, confirmed.confirmation().total().minorUnits());
		assertEquals(2, confirmed.confirmation().stretches().size());
		assertEquals(3 * PRICE, confirmed.confirmation().stretches().get(0).amount().minorUnits());

		long stayId = jdbc.sql("SELECT id FROM stay WHERE code = :c AND venue_id = :v AND first_date = :f AND last_date = :l")
				.param("c", code).param("v", venue.id()).param("f", first).param("l", first.plusDays(6))
				.query(Long.class).single();
		List<String> rows = jdbc.sql("SELECT code || ' ' || set_id || ' ' || booking_date || '..' || last_date || ' ' "
						+ "|| amount_minor || ' ' || status FROM booking WHERE stay_id = :s ORDER BY booking_date")
				.param("s", stayId).query(String.class).list();
		assertEquals(List.of(
				code + "-1 " + a.value() + " " + first + ".." + first.plusDays(2) + " " + 3 * PRICE + " CONFIRMED",
				code + "-2 " + b.value() + " " + first.plusDays(3) + ".." + first.plusDays(6) + " " + 4 * PRICE + " CONFIRMED"),
				rows, "one booking per stretch, a derived row code, each at its own total");
		verify(confirmBooking).confirmAll(anyList(), any());
		verify(confirmBooking, never()).confirm(anyLong(), any());
		assertEquals(3L, heldDays(jdbc, a, first, first.plusDays(2)));
		assertEquals(4L, heldDays(jdbc, b, first.plusDays(3), first.plusDays(6)));
		assertEquals(0L, heldDays(jdbc, a, first.plusDays(3), first.plusDays(6)), "a stretch claims only its own days");
		assertEquals(2, events.stream(BookingConfirmed.class).count(), "one BookingConfirmed per stretch");
	}

	@Test
	void aTakenDayRefusesTheWholePlanAndReleasesEveryDayWon() {
		Venue venue = venue("INSTANT", null, true);
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();
		take(jdbc, b, first.plusDays(5));

		StayOutcome outcome = createStay.create(plan(a, 3, b, 4, first));

		assertEquals(new StayOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN), outcome);
		assertEquals(0L, heldDays(jdbc, a, first, first.plusDays(6)), "the first stretch's days are given back");
		assertEquals(1L, heldDays(jdbc, b, first, first.plusDays(6)), "only the pre-existing claim remains");
		assertEquals(0L, jdbc.sql("SELECT count(*) FROM stay WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single(), "no stay row");
	}

	@Test
	void refusesAFencedPlanBeforeAnyClaim() {
		LocalDate first = firstDay();
		Venue instant = venue("INSTANT", null, true);
		SetId a = instant.online().get(0);
		SetId b = instant.online().get(1);

		assertEquals(rejected(BookingOutcome.Rejected.NOT_ONLINE_POOL),
				createStay.create(plan(a, 3, instant.walkIn(), 4, first)));
		assertEquals(rejected(BookingOutcome.Rejected.NO_SUCH_SET),
				createStay.create(plan(a, 3, new SetId(-1), 4, first)));
		Venue other = venue("INSTANT", null, true);
		assertEquals(rejected(BookingOutcome.Rejected.NO_SUCH_SET),
				createStay.create(plan(a, 3, other.online().get(0), 4, first)), "a plan spans one venue");
		Venue hidden = venue("INSTANT", null, false);
		assertEquals(rejected(BookingOutcome.Rejected.NO_SUCH_SET),
				createStay.create(plan(hidden.online().get(0), 3, hidden.online().get(1), 4, first)));
		Venue capped = venue("INSTANT", 5, true);
		assertEquals(rejected(BookingOutcome.Rejected.STAY_TOO_LONG),
				createStay.create(plan(capped.online().get(0), 3, capped.online().get(1), 4, first)));
		Venue cappedRequest = venue("REQUEST", 5, true);
		assertEquals(rejected(BookingOutcome.Rejected.STAY_TOO_LONG),
				createStay.create(plan(cappedRequest.online().get(0), 3, cappedRequest.online().get(1), 4, first)),
				"a Request venue's maximum stay binds a plan as it binds one set");
		assertEquals(0L, heldDays(jdbc, a, first, first.plusDays(6)), "a refusal claims nothing");
		assertEquals(0L, heldDays(jdbc, b, first, first.plusDays(6)));
	}

	@Test
	void aRequestVenueTakesAPlanAsOneRequest() {
		Venue venue = venue("REQUEST", null, true);
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();

		StayOutcome outcome = createStay.create(plan(a, 3, b, 4, first));

		StayOutcome.Requested requested = assertInstanceOf(StayOutcome.Requested.class, outcome);
		assertEquals(ai.riviera.platform.booking.domain.BookingStatus.PENDING_REQUEST,
				requested.confirmation().status());
		assertEquals(7 * PRICE, requested.confirmation().total().minorUnits());
		assertEquals(2, requested.confirmation().stretches().size());
		String code = requested.confirmation().code();
		List<String> rows = jdbc.sql("""
				SELECT b.status || ' ' || b.set_id || ' ' || (b.request_expires_at = :expires)
				FROM booking b JOIN stay s ON s.id = b.stay_id WHERE s.code = :c ORDER BY b.booking_date
				""").param("c", code).param("expires", java.sql.Timestamp.from(requested.requestExpiresAt()))
				.query(String.class).list();
		assertEquals(List.of("PENDING_REQUEST " + a.value() + " true", "PENDING_REQUEST " + b.value() + " true"), rows,
				"one pending stretch per stop, sharing one deadline");
		assertEquals(0L, heldDays(jdbc, a, first, first.plusDays(6)), "a request holds nothing (ADR-0025)");
		assertEquals(0L, heldDays(jdbc, b, first, first.plusDays(6)));
		assertEquals(0, events.stream(BookingConfirmed.class).count());
	}

	@Test
	void aRequestVenueRefusesAPlanWithATakenDay() {
		Venue venue = venue("REQUEST", null, true);
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();
		take(jdbc, b, first.plusDays(5));

		assertEquals(rejected(BookingOutcome.Rejected.SET_TAKEN), createStay.create(plan(a, 3, b, 4, first)));
		assertEquals(0L, jdbc.sql("SELECT count(*) FROM stay WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single(), "no stay row");
	}

	@Test
	void aMalformedPlanIsRefusedByTheCommand() {
		LocalDate first = firstDay();
		SetId a = new SetId(1);
		SetId b = new SetId(2);
		assertThrows(IllegalArgumentException.class, () -> new CreateStayCommand(List.of(
				new CreateStayCommand.Stretch(a, first, first.plusDays(2))), GUEST, null), "one stretch is a booking");
		assertThrows(IllegalArgumentException.class, () -> new CreateStayCommand(List.of(
				new CreateStayCommand.Stretch(a, first, first.plusDays(2)),
				new CreateStayCommand.Stretch(b, first.plusDays(4), first.plusDays(6))), GUEST, null), "a gap");
		assertThrows(IllegalArgumentException.class, () -> new CreateStayCommand(List.of(
				new CreateStayCommand.Stretch(a, first, first.plusDays(2)),
				new CreateStayCommand.Stretch(b, first.plusDays(2), first.plusDays(6))), GUEST, null), "an overlap");
		assertThrows(IllegalArgumentException.class, () -> new CreateStayCommand(List.of(
				new CreateStayCommand.Stretch(a, first, first.plusDays(2)),
				new CreateStayCommand.Stretch(a, first.plusDays(3), first.plusDays(6))), GUEST, null), "same set twice");
	}

	private static StayOutcome rejected(BookingOutcome.Rejected reason) {
		return new StayOutcome.Rejected(reason);
	}

	@Test
	void theStubConfirmOfAStayIsAllOrNothing() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", "atomic-" + System.nanoTime() + "@example.com").query(Long.class).single();
		long stay = jdbc.sql("INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:c, :v, :f, :l) RETURNING id")
				.param("c", "ATOMIC" + System.nanoTime() % 1_000_000).param("v", venue.id()).param("f", first)
				.param("l", first.plusDays(3)).query(Long.class).single();
		long awaiting = insertStretch(venue, venue.online().get(0), customer, first, first.plusDays(1), stay, "AWAITING_PAYMENT");
		long alreadyConfirmed = insertStretch(venue, venue.online().get(1), customer, first.plusDays(2), first.plusDays(3), stay,
				"CONFIRMED");

		assertThrows(IllegalStateException.class,
				() -> confirmBooking.confirmAll(List.of(awaiting, alreadyConfirmed), Instant.now()));

		assertEquals("AWAITING_PAYMENT", jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", awaiting)
				.query(String.class).single(), "a stretch that could not confirm leaves its siblings unconfirmed");
	}

	private long insertStretch(Venue venue, SetId set, long customer, LocalDate first, LocalDate last, long stay, String status) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, confirmed_at, stay_id)
				VALUES (:code, :venue, :set, :cust, :first, :last, 4500, 'EUR', :status,
				        CASE WHEN :status = 'CONFIRMED' THEN now() END, :stay)
				RETURNING id
				""").param("code", "ATOMIC-" + System.nanoTime() % 1_000_000).param("venue", venue.id()).param("set", set.value())
				.param("cust", customer).param("first", first).param("last", last).param("status", status).param("stay", stay)
				.query(Long.class).single();
	}
}
