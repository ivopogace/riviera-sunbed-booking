package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.api.ClaimOutcome;
import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.CreateBookingCommand;
import ai.riviera.platform.booking.application.out.BookingCodeGenerator;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.NewBooking;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.api.CustomerId;
import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.venue.api.MoneyView;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.api.VenueMapView;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Branch coverage for the Instant-Book orchestration (issue #6) with in-memory fakes — no
 * Spring, no DB. Proves outcome mapping (AC-1/2/4/5), that the amount is the set price
 * (AC-8), and that the booking code is never logged (AC-7, invariant #7).
 */
class CreateBookingServiceTest {

	private static final SetId SET = new SetId(2);
	private static final LocalDate DATE = LocalDate.of(2026, 12, 1);
	private static final GuestContact GUEST = new GuestContact("a@b.com", "Ana", "+355600");
	// Fixed "now" well before the 18:00 evening-before cutoff for DATE.
	private static final Clock CLOCK =
			Clock.fixed(Instant.parse("2026-11-01T09:00:00Z"), ZoneId.of("UTC"));

	private final RecordingBookings bookings = new RecordingBookings();

	private SetBookingInfo set(String pool) {
		return new SetBookingInfo(SET, new VenueId(1), "Miramar", "Front row", 2, pool,
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0));
	}

	private CreateBookingService service(SetBookingInfo info, AvailabilityClaim claim,
			CheckoutPort checkout, BookingCodeGenerator codes) {
		VenueCatalog catalog = new FakeCatalog(info);
		CustomerDirectory customers = contact -> new CustomerId(99);
		return new CreateBookingService(catalog, claim, customers, checkout, bookings, codes,
				new BookingCutoff(CLOCK), CLOCK);
	}

	private CreateBookingCommand command() {
		return new CreateBookingCommand(SET, DATE, GUEST);
	}

	@Test
	void confirmsWhenClaimWinsAndPaymentSucceeds() {
		CreateBookingService service = service(set("ONLINE"),
				(id, date) -> ClaimOutcome.CLAIMED,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"),
				() -> "CODE123456");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertEquals("CODE123456", confirmed.confirmation().code());
		assertEquals(4500L, confirmed.confirmation().set().price().minorUnits(), "amount = set price");
		assertEquals(1, bookings.inserted.size());
		assertEquals(4500L, bookings.inserted.getFirst().amountMinor());
		assertEquals(1, bookings.confirmed.size(), "the booking is confirmed exactly once");
	}

	@Test
	void regeneratesCodeOnCollisionAndConfirms() {
		// First insert "collides" (empty), second succeeds — the booking must still confirm with
		// the second code (proves the ON CONFLICT retry actually recovers).
		java.util.List<String> codes = new ArrayList<>(java.util.List.of("DUPCODE0001", "FRESHCODE02"));
		var collidingOnce = new Bookings() {
			boolean first = true;

			@Override
			public java.util.OptionalLong insertAwaitingPayment(NewBooking booking) {
				if (first) {
					first = false;
					return java.util.OptionalLong.empty();
				}
				return java.util.OptionalLong.of(1234L);
			}

			@Override
			public void confirm(long bookingId, java.time.Instant at) {
				// no-op
			}
		};
		VenueCatalog catalog = new FakeCatalog(set("ONLINE"));
		CustomerDirectory customers = contact -> new CustomerId(1);
		var service = new CreateBookingService(catalog, (id, date) -> ClaimOutcome.CLAIMED, customers,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), collidingOnce,
				() -> codes.removeFirst(), new BookingCutoff(CLOCK), CLOCK);

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertEquals("FRESHCODE02", confirmed.confirmation().code(), "uses the second, non-colliding code");
	}

	@Test
	void rejectsTakenSetWithoutPersisting() {
		CreateBookingService service = service(set("ONLINE"),
				(id, date) -> ClaimOutcome.ALREADY_TAKEN,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> "X");

		assertSame(BookingOutcome.Rejected.SET_TAKEN, service.create(command()));
		assertFalse(bookings.inserted.size() > 0, "a lost claim must create no booking row");
	}

	@Test
	void paymentDeclineThrowsToRollBackTheClaim() {
		// The stub never declines in U3; this proves the Failed branch aborts (throws) so the
		// transaction — and the joined availability claim — rolls back rather than confirming.
		CreateBookingService service = service(set("ONLINE"),
				(id, date) -> ClaimOutcome.CLAIMED,
				(ref, money) -> new PaymentOutcome.Failed("card_declined"), () -> "CODEX12345");

		assertThrows(PaymentDeclinedException.class, () -> service.create(command()));
		assertFalse(bookings.confirmed.size() > 0, "a declined payment confirms nothing");
	}

	@Test
	void rejectsWalkInPool() {
		CreateBookingService service = service(set("WALK_IN"),
				(id, date) -> ClaimOutcome.CLAIMED,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		assertSame(BookingOutcome.Rejected.NOT_ONLINE_POOL, service.create(command()));
	}

	@Test
	void rejectsUnknownSet() {
		CreateBookingService service = service(null,
				(id, date) -> ClaimOutcome.CLAIMED,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		assertSame(BookingOutcome.Rejected.NO_SUCH_SET, service.create(command()));
	}

	@Test
	void rejectsAfterCutoff() {
		// now (2026-11-01) is fine for DATE; use a past date to trip the cutoff.
		CreateBookingService service = service(set("ONLINE"),
				(id, date) -> ClaimOutcome.CLAIMED,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 10, 1), GUEST));
		assertSame(BookingOutcome.Rejected.BOOKING_CLOSED, outcome);
	}

	@Test
	void codeNeverLogged() {
		Logger logger = (Logger) LoggerFactory.getLogger(CreateBookingService.class);
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		logger.addAppender(appender);
		try {
			String code = "SECRETCODE";
			CreateBookingService service = service(set("ONLINE"),
					(id, date) -> ClaimOutcome.CLAIMED,
					(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> code);
			service.create(command());

			boolean leaked = appender.list.stream()
					.filter(e -> e.getLevel().isGreaterOrEqual(Level.DEBUG))
					.anyMatch(e -> e.getFormattedMessage().contains(code));
			assertFalse(leaked, "the booking code must never appear in logs (invariant #7)");
		}
		finally {
			logger.detachAppender(appender);
		}
	}

	/** Captures persistence calls so branches can be asserted without a database. */
	private static final class RecordingBookings implements Bookings {
		final List<NewBooking> inserted = new ArrayList<>();
		final List<Long> confirmed = new ArrayList<>();
		private long nextId = 1000;

		@Override
		public java.util.OptionalLong insertAwaitingPayment(NewBooking booking) {
			inserted.add(booking);
			return java.util.OptionalLong.of(++nextId);
		}

		@Override
		public void confirm(long bookingId, Instant confirmedAt) {
			confirmed.add(bookingId);
		}
	}

	/** VenueCatalog fake returning a configured set (or empty for "no such set"). */
	private record FakeCatalog(SetBookingInfo info) implements VenueCatalog {
		@Override
		public Optional<VenueMapView> findVenueMap(VenueId id) {
			return Optional.empty();
		}

		@Override
		public Optional<String> poolOf(SetId setId) {
			return Optional.ofNullable(info).map(SetBookingInfo::pool);
		}

		@Override
		public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
			return Optional.ofNullable(info);
		}
	}
}
