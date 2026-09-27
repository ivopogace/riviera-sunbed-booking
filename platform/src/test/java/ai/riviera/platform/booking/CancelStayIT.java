package ai.riviera.platform.booking;

import java.time.Duration;
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
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.venue.vocabulary.SetId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.heldDays;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * Cancelling a stay by its code (design D6): every stretch {@code CANCELLED} with its refund quoted
 * on the stay's first day, every day of every stretch released (invariant #2), one
 * {@code BookingCancelled} per stretch so payout reverses each accrual exactly once (invariant #9),
 * one summed refund to the guest, and the code-gated view reading the whole stay cancelled. Stub
 * gateway, real Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@RecordApplicationEvents
class CancelStayIT {

	@Autowired
	CreateStay createStay;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	ViewBooking viewBooking;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	@Test
	void cancelsEveryStretchReleasesEveryDayAndReversesEachAccrualOnce() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();
		String code = assertInstanceOf(StayOutcome.Confirmed.class, createStay.create(plan(a, 3, b, 4, first)))
				.confirmation().code();
		Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> accruals(venue.id()) == 2L);

		CancelOutcome outcome = cancelBooking.cancel(code);

		assertEquals(new CancelOutcome.Cancelled(7 * PRICE, "EUR", CancelOutcome.Tier.FULL), outcome,
				"ten days out is the free window: the whole stay refunds in full, once");
		assertEquals(List.of("CANCELLED", "CANCELLED"),
				jdbc.sql("SELECT status FROM booking WHERE venue_id = :v ORDER BY booking_date").param("v", venue.id())
						.query(String.class).list());
		assertEquals(0L, heldDays(jdbc, a, first, first.plusDays(6)));
		assertEquals(0L, heldDays(jdbc, b, first, first.plusDays(6)), "every day of every stretch is released");
		assertEquals(2, events.stream(BookingCancelled.class).count(), "one BookingCancelled per stretch");
		Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> reversals(venue.id()) == 2L);
		assertEquals(2L, reversals(venue.id()), "payout reverses each stretch's accrual exactly once (#9)");

		BookingDetail view = viewBooking.byCode(code).orElseThrow();
		assertEquals(BookingStatus.CANCELLED, view.status());
		assertEquals(7 * PRICE, view.refundedAmount().minorUnits());
		assertEquals(2, view.stretches().size());
		assertInstanceOf(StayOutcome.Confirmed.class, createStay.create(plan(a, 3, b, 4, first)),
				"the same plan is bookable again");
	}

	@Test
	void anUnknownCodeIsNotFoundAndACancelledStayIsNotCancellableTwice() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		String code = assertInstanceOf(StayOutcome.Confirmed.class,
				createStay.create(plan(venue.online().get(0), 2, venue.online().get(1), 2, first))).confirmation().code();
		Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> accruals(venue.id()) == 2L);

		assertInstanceOf(CancelOutcome.NotFound.class, cancelBooking.cancel("NOSUCHSTAY"));
		assertInstanceOf(CancelOutcome.Cancelled.class, cancelBooking.cancel(code));
		assertEquals(new CancelOutcome.NotCancellable(BookingStatus.CANCELLED), cancelBooking.cancel(code));
	}

	private long accruals(long venue) {
		return jdbc.sql("SELECT count(*) FROM payout_ledger_entry WHERE entry_type = 'ACCRUAL' "
						+ "AND booking_id IN (SELECT id FROM booking WHERE venue_id = :v)").param("v", venue)
				.query(Long.class).single();
	}

	private long reversals(long venue) {
		return jdbc.sql("SELECT count(*) FROM payout_ledger_entry WHERE entry_type = 'REVERSAL' "
						+ "AND booking_id IN (SELECT id FROM booking WHERE venue_id = :v)").param("v", venue)
				.query(Long.class).single();
	}
}
