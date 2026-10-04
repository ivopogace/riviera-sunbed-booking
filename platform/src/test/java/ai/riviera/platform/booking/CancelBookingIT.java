package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.refund.DayRefundStamp;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * AC-4/AC-5/AC-7 (issue #11): cancelling a CONFIRMED booking frees the {@code (set, date)}
 * (invariant #2), stamps the server-computed refund, and publishes exactly one
 * {@link BookingCancelled}; a non-CONFIRMED booking is rejected. Drives the real stub path through
 * the {@link CancelBooking} port against Testcontainers Postgres.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@RecordApplicationEvents
class CancelBookingIT {

	private static final GuestContact GUEST = new GuestContact("cancel@example.com", "Cara Ncel", "+355613");

	@Autowired
	CreateBooking createBooking;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	ViewBooking viewBooking;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ai.riviera.platform.booking.application.Bookings bookings;

	@Autowired
	ApplicationEvents events;

	@Autowired
	ai.riviera.platform.booking.application.checkin.MarkNoShows markNoShows;

	private record Created(String code, long id, long setId, long amountMinor) {
	}

	private Created confirmBookingOn(LocalDate date) {
		long setId = VisibleOnlineSets.newest(jdbc).id();
		BookingOutcome outcome =
				createBooking.create(new CreateBookingCommand(new SetId(setId), date, GUEST));
		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		String code = confirmed.confirmation().code();
		long id = jdbc.sql("SELECT id FROM booking WHERE code = :c").param("c", code)
				.query(Long.class).single();
		long amount = jdbc.sql("SELECT amount_minor FROM booking WHERE id = :id").param("id", id)
				.query(Long.class).single();
		return new Created(code, id, setId, amount);
	}

	private long availabilityRows(long setId, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", setId).param("d", date).query(Long.class).single();
	}

	@Test
	void cancelBeforeCutoffFullyRefundsReleasesAndPublishes() {
		LocalDate date = LocalDate.of(2035, 3, 20); // far future → before cutoff → full refund
		Created booking = confirmBookingOn(date);
		assertEquals(1, availabilityRows(booking.setId(), date), "the set is held before cancel");

		CancelOutcome outcome = cancelBooking.cancel(booking.code());

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class, outcome);
		assertEquals(CancelOutcome.Tier.FULL, cancelled.tier(), "before the cutoff is a full refund");
		assertEquals(booking.amountMinor(), cancelled.refundMinor(), "full refund = the amount paid");

		assertEquals("CANCELLED", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", booking.id()).query(String.class).single());
		assertEquals(booking.amountMinor(), jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id")
				.param("id", booking.id()).query(Long.class).single(), "refund is stamped on the booking");
		assertEquals("POLICY", jdbc.sql("SELECT cancel_reason FROM booking WHERE id = :id")
				.param("id", booking.id()).query(String.class).single(),
				"a tourist cancel records reason POLICY (U9)");
		assertEquals(0, availabilityRows(booking.setId(), date), "cancel releases the (set, date)");

		List<BookingCancelled> published = events.stream(BookingCancelled.class).toList();
		assertEquals(1, published.size(), "exactly one BookingCancelled is published");
		assertEquals(booking.id(), published.getFirst().bookingId().value());
		assertEquals(booking.amountMinor(), published.getFirst().refundMinor(), "event carries the refund");
	}

	/**
	 * The reason is only useful if it survives the read back out. This drives the whole chain the view
	 * uses — the {@code SELECT}, the row mapper's token→enum step, and the detail assembly — because a
	 * column stamped correctly but never projected reads exactly like a never-charged cancellation.
	 */
	@Test
	void cancellationReasonRoundTripsOntoTheBookingDetail() {
		Created booking = confirmBookingOn(LocalDate.of(2035, 5, 14));
		cancelBooking.cancel(booking.code());

		BookingDetail detail = viewBooking.byCode(booking.code()).orElseThrow();

		assertEquals(RefundReason.POLICY, detail.cancelReason());
		assertEquals(booking.amountMinor(), detail.refundedAmount().minorUnits());
	}

	/**
	 * The null half of the mapper: a row with no refund decision reads back no reason. Asserted on a
	 * live booking rather than a hand-cancelled one — the real never-charged path is
	 * {@code cancelAwaitingPayment}, which needs an {@code AWAITING_PAYMENT} row this stub-profile
	 * class cannot create, and faking {@code CONFIRMED → CANCELLED} by hand would assert against a
	 * state production never produces (and strand the availability claim these tests count).
	 */
	@Test
	void aBookingWithNoRefundDecisionHasNoCancellationReason() {
		Created booking = confirmBookingOn(LocalDate.of(2035, 5, 15));

		BookingDetail detail = viewBooking.byCode(booking.code()).orElseThrow();

		assertNull(detail.cancelReason(), "no refund decision was taken, so no reason is stamped");
		assertNull(detail.refundedAmount(), "and nothing was refunded");
	}

	@Test
	void cancellingTwiceIsNotCancellableTheSecondTime() {
		Created booking = confirmBookingOn(LocalDate.of(2035, 4, 10));

		assertInstanceOf(CancelOutcome.Cancelled.class, cancelBooking.cancel(booking.code()));
		CancelOutcome second = cancelBooking.cancel(booking.code());

		assertInstanceOf(CancelOutcome.NotCancellable.class, second,
				"a re-cancel is a no-op guarded by the CONFIRMED transition");
		List<BookingCancelled> published = events.stream(BookingCancelled.class).toList();
		assertEquals(1, published.size(), "the second cancel publishes nothing (exactly-once)");
	}

	@Test
	void noShowAnswersWindowClosedLikeAnUnsweptSpentDay() {
		Created booking = confirmBookingOn(LocalDate.of(2035, 5, 12));
		LocalDate spent = LocalDate.of(2021, 7, 4);
		new ServiceDayBackdate(jdbc).moveToPast(booking.code(), spent);
		markNoShows.sweep();
		assertEquals("NO_SHOW", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", booking.id()).query(String.class).single(),
				"the sweep must actually have run on this row");

		CancelOutcome outcome = cancelBooking.cancel(booking.code());

		assertInstanceOf(CancelOutcome.WindowClosed.class, outcome,
				"a swept no-show reads as a spent day, not a generic refusal: only WindowClosed renders"
						+ " the accurate copy, and the guest can never satisfy a please-try-again");
		assertEquals("NO_SHOW", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", booking.id()).query(String.class).single());
		assertNull(jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id")
				.param("id", booking.id()).query(Long.class).optional().orElse(null),
				"no refund is stamped");
		assertEquals(0, events.stream(BookingCancelled.class).count(),
				"no BookingCancelled means no Stripe refund and no payout reversal");
	}

	/** AC-9 (#1210): after a day refund the guest cancels what they still hold, quoted and refunded over the remainder. */
	@Test
	void aCancelQuotedBeforeADayRefundWritesNothing() {
		// The quote read 9000 remaining; a weather refund of day 2 (3000) landed before the write (#1210).
		LocalDate first = LocalDate.of(2035, 7, 1);
		long setId = VisibleOnlineSets.newest(jdbc).id();
		long venueId = jdbc.sql("SELECT venue_id FROM set_position WHERE id = :s").param("s", setId)
				.query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('storm-race@example.com', 'Guest', '+355600') RETURNING id")
				.query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES ('CANCELWX02', :venue, :set, :cust, :first, :last, 9000, 'EUR', 'CONFIRMED', NOW())
				RETURNING id
				""").param("venue", venueId).param("set", setId).param("cust", customer)
				.param("first", first).param("last", first.plusDays(2)).query(Long.class).single();
		jdbc.sql("UPDATE booking_day SET refunded_at = NOW(), refund_minor = 3000, refund_reason = 'WEATHER' "
						+ "WHERE booking_id = :id AND service_date = :d")
				.param("id", id).param("d", first.plusDays(1)).update();

		assertTrue(bookings.cancelConfirmed(id, java.time.Instant.now(), 9000L, RefundReason.POLICY, 9000L).isEmpty(),
				"the stale quote writes nothing: the day it counted was refunded since");
		assertEquals("CONFIRMED", jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", id)
				.query(String.class).single());

		assertTrue(bookings.cancelConfirmed(id, java.time.Instant.now(), 6000L, RefundReason.POLICY, 6000L).isPresent(),
				"a quote over the true remainder cancels");
	}

	@Test
	void aCancellationAfterADayRefundRefundsTheRemainder() {
		LocalDate first = LocalDate.of(2035, 7, 1);
		long setId = VisibleOnlineSets.newest(jdbc).id();
		long venueId = jdbc.sql("SELECT venue_id FROM set_position WHERE id = :s").param("s", setId)
				.query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('storm-cancel@example.com', 'Guest', '+355600') RETURNING id")
				.query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES ('CANCELWX01', :venue, :set, :cust, :first, :last, 9000, 'EUR', 'CONFIRMED', NOW())
				RETURNING id
				""").param("venue", venueId).param("set", setId).param("cust", customer)
				.param("first", first).param("last", first.plusDays(2)).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor, commission_minor,
				                                 net_minor, currency)
				VALUES (:v, :b, 'ACCRUAL', 9000, 0, 9000, 'EUR')
				""").param("v", venueId).param("b", id).update();
		jdbc.sql("UPDATE booking_day SET refunded_at = NOW(), refund_minor = 3000, refund_reason = 'WEATHER' "
						+ "WHERE booking_id = :id AND service_date = :d")
				.param("id", id).param("d", first.plusDays(1)).update();

		BookingDetail before = viewBooking.byCode("CANCELWX01").orElseThrow();
		assertEquals(6000L, before.refundIfCancelledNow().minorUnits(), "quoted over the remainder");
		assertEquals(1, before.refundedDays().size());
		assertEquals(first.plusDays(1), before.refundedDays().getFirst().day());

		CancelOutcome outcome = cancelBooking.cancel("CANCELWX01");

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class, outcome);
		assertEquals(6000L, cancelled.refundMinor(), "the day already refunded is never refunded again");
		assertEquals(CancelOutcome.Tier.FULL, cancelled.tier(), "everything still held came back");
		assertEquals(6000L, events.stream(BookingCancelled.class).filter(e -> e.bookingId().value() == id)
				.findFirst().orElseThrow().refundMinor());
	}

	@Test
	void unknownCodeIsNotFound() {
		assertInstanceOf(CancelOutcome.NotFound.class, cancelBooking.cancel("NOSUCHCODE"));
	}

	@Test
	void rejectsCancelAfterTheServiceDayHasPassed() {
		LocalDate booked = LocalDate.of(2035, 5, 11);
		Created booking = confirmBookingOn(booked);
		LocalDate spent = LocalDate.of(2021, 6, 3);
		new ServiceDayBackdate(jdbc).moveToPast(booking.code(), spent);

		CancelOutcome outcome = cancelBooking.cancel(booking.code());

		assertInstanceOf(CancelOutcome.WindowClosed.class, outcome,
				"a stay the guest could already consume is no longer reclaimable");
		assertEquals("CONFIRMED", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", booking.id()).query(String.class).single(),
				"the delivered booking keeps its status");
		assertNull(jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id")
				.param("id", booking.id()).query(Long.class).optional().orElse(null),
				"no refund is stamped");
		assertEquals(1, availabilityRows(booking.setId(), spent),
				"the spent day is not released back into the pool");
		assertEquals(0, events.stream(BookingCancelled.class).count(),
				"no BookingCancelled means no Stripe refund and no payout reversal");
	}

	/**
	 * A {@code CONFIRMED} booking over {@code days} days of {@code amountMinor}, every day claimed, as the reserve
	 * leaves one (dates in 2036, this class's own).
	 */
	private Created confirmedSpan(String code, LocalDate first, int days, long amountMinor) {
		long setId = VisibleOnlineSets.newest(jdbc).id();
		long venueId = jdbc.sql("SELECT venue_id FROM set_position WHERE id = :s").param("s", setId)
				.query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', 'CONFIRMED', NOW())
				RETURNING id
				""").param("code", code).param("venue", venueId).param("set", setId).param("cust", customer)
				.param("first", first).param("last", first.plusDays(days - 1L)).param("amount", amountMinor)
				.query(Long.class).single();
		for (int day = 0; day < days; day++) {
			jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:s, :d, 'BOOKED_ONLINE')")
					.param("s", setId).param("d", first.plusDays(day)).update();
		}
		return new Created(code, id, setId, amountMinor);
	}

	private void refundDay(long bookingId, LocalDate day, long refundMinor) {
		bookings.refundDay(bookingId, day, refundMinor, java.time.Instant.now(), DayRefundStamp.weather()).orElseThrow();
	}

	private long heldDays(Created booking, LocalDate first, int days) {
		long held = 0;
		for (int day = 0; day < days; day++) {
			held += availabilityRows(booking.setId(), first.plusDays(day));
		}
		return held;
	}

	/** ADR-0026 §7 (#1381): with every day refunded there is nothing left — no cancel, no release, no mail, the row as it was. */
	@Test
	void aBookingWithEveryDayRefundedHasNothingLeftToCancel() {
		LocalDate first = LocalDate.of(2036, 7, 11);
		Created booking = confirmedSpan("CANCELNL01", first, 3, 9000L);
		for (int day = 0; day < 3; day++) {
			refundDay(booking.id(), first.plusDays(day), 3000L);
		}

		BookingDetail before = viewBooking.byCode(booking.code()).orElseThrow();
		CancelOutcome outcome = cancelBooking.cancel(booking.code());

		assertFalse(before.cancellable(), "the view offers no cancel");
		assertTrue(before.nothingLeft(), "and says why");
		assertInstanceOf(CancelOutcome.NothingLeft.class, outcome);
		assertEquals("CONFIRMED", jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", booking.id())
				.query(String.class).single(), "no transition");
		assertEquals(3L, heldDays(booking, first, 3), "no release (#2): a weather-refunded day stays the guest's");
		assertEquals(0L, events.stream(BookingCancelled.class).filter(e -> e.bookingId().value() == booking.id()).count(),
				"nothing announced, so no refund or mail follows");
	}

	/**
	 * #1381, the rule: a day whose share is €0 and which is not refunded is still the guest's, so a remainder of 0
	 * is not <em>nothing left</em> (ADR-0026 §8) — the cancel proceeds as a cancel.
	 */
	@Test
	void aZeroShareDayStillHeldIsNotNothingLeft() {
		LocalDate first = LocalDate.of(2036, 7, 1);
		Created booking = confirmedSpan("CANCELNL02", first, 3, 2L);
		refundDay(booking.id(), first, 2L);
		refundDay(booking.id(), first.plusDays(1), 0L);

		var record = bookings.findByCode(booking.code()).orElseThrow();
		assertEquals(0L, record.remainingMinor(), "nothing is left to refund in money");
		assertFalse(record.everyDayRefunded(), "yet the third day is still the guest's");
		assertInstanceOf(CancelOutcome.Cancelled.class, cancelBooking.cancel(booking.code()),
				"so the cancel is a cancel, releasing the day the guest gives back");
		assertEquals(0L, heldDays(booking, first, 3));
	}
}
