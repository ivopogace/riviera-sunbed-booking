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
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.ConfirmBooking;
import ai.riviera.platform.booking.application.in.CreateBookingCommand;
import ai.riviera.platform.booking.application.in.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.out.BookingCodeGenerator;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.ClaimRef;
import ai.riviera.platform.booking.application.out.ConfirmedBooking;
import ai.riviera.platform.booking.application.out.NewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
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
 * Branch coverage for the Instant-Book orchestration (issue #6, now two-phase per issue #52) with
 * in-memory fakes — no Spring, no DB. Proves outcome mapping, that the amount is the set price,
 * that the booking row is persisted <em>before</em> payment is attempted (R-3 ordering), that a
 * failed payment compensates by releasing the claim, and that the booking code is never logged
 * (invariant #7). The {@code @Transactional} on {@link ReserveSetService#reserve} is inert when
 * called directly (no proxy), so wiring the real {@code ReserveSetService} here exercises the full
 * orchestration end-to-end with fakes.
 */
class CreateBookingServiceTest {

	private static final SetId SET = new SetId(2);
	private static final LocalDate DATE = LocalDate.of(2026, 12, 1);
	private static final GuestContact GUEST = new GuestContact("a@b.com", "Ana", "+355600");
	// Fixed "now" well before the 18:00 evening-before cutoff for DATE.
	private static final Clock CLOCK =
			Clock.fixed(Instant.parse("2026-11-01T09:00:00Z"), ZoneId.of("UTC"));

	private final RecordingBookings bookings = new RecordingBookings();
	private final RecordingConfirm confirmer = new RecordingConfirm();
	private final RecordingRelease release = new RecordingRelease();

	private SetBookingInfo set(String pool) {
		return new SetBookingInfo(SET, new VenueId(1), "Miramar", "Front row", 2, pool,
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0));
	}

	private CreateBookingService service(SetBookingInfo info, AvailabilityClaim claim,
			CheckoutPort checkout, BookingCodeGenerator codes) {
		VenueCatalog catalog = new FakeCatalog(info);
		CustomerDirectory customers = contact -> new CustomerId(99);
		ReserveSetService reservation = new ReserveSetService(catalog, claim, customers, bookings,
				codes, new BookingCutoff(CLOCK));
		return new CreateBookingService(reservation, checkout, confirmer, release, CLOCK);
	}

	private CreateBookingCommand command() {
		return new CreateBookingCommand(SET, DATE, GUEST);
	}

	/** A fake claim port (AvailabilityClaim is no longer single-method since U4's release). */
	private static AvailabilityClaim claiming(ClaimOutcome outcome) {
		return new AvailabilityClaim() {
			@Override
			public ClaimOutcome claim(SetId setId, LocalDate bookingDate) {
				return outcome;
			}

			@Override
			public void release(SetId setId, LocalDate bookingDate) {
				// no-op for create-flow branch tests
			}
		};
	}

	@Test
	void confirmsWhenClaimWinsAndPaymentSucceeds() {
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(ref, money) -> new PaymentOutcome.Succeeded("ok"),
				() -> "CODE123456");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertEquals("CODE123456", confirmed.confirmation().code());
		assertEquals(4500L, confirmed.confirmation().set().price().minorUnits(), "amount = set price");
		assertEquals(1, bookings.inserted.size());
		assertEquals(4500L, bookings.inserted.getFirst().amountMinor());
		assertEquals(1, confirmer.confirmed.size(), "the booking is confirmed exactly once via the seam");
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
			public ConfirmedBooking confirm(long bookingId, java.time.Instant at) {
				return null; // unused: the stub path confirms via the ConfirmBooking seam, not here
			}

			@Override
			public java.util.Optional<ConfirmedBooking> confirmFromPayment(long bookingId, java.time.Instant at) {
				return java.util.Optional.empty();
			}

			@Override
			public java.util.Optional<ClaimRef> cancelAwaitingPayment(long bookingId) {
				return java.util.Optional.empty();
			}

			@Override
			public java.util.Optional<ai.riviera.platform.booking.application.out.BookingRecord> findByCode(
					String code) {
				return java.util.Optional.empty();
			}

			@Override
			public java.util.Optional<ai.riviera.platform.booking.application.out.CancelledBooking> cancelConfirmed(
					long bookingId, java.time.Instant cancelledAt, long refundMinor,
					ai.riviera.platform.booking.api.RefundReason reason) {
				return java.util.Optional.empty();
			}

			@Override
			public List<ai.riviera.platform.booking.application.in.DailyBooking> findConfirmedForVenueOn(
					ai.riviera.platform.venue.api.VenueId venueId, java.time.LocalDate date) {
				return List.of();
			}

			@Override
			public List<ai.riviera.platform.booking.api.BookingId> findExpirableAwaitingPayment(
					java.time.Instant olderThan) {
				return List.of();
			}
		};
		VenueCatalog catalog = new FakeCatalog(set("ONLINE"));
		CustomerDirectory customers = contact -> new CustomerId(1);
		ReserveSetService reservation = new ReserveSetService(catalog, claiming(ClaimOutcome.CLAIMED),
				customers, collidingOnce, () -> codes.removeFirst(), new BookingCutoff(CLOCK));
		var service = new CreateBookingService(reservation,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), confirmer, release, CLOCK);

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertEquals("FRESHCODE02", confirmed.confirmation().code(), "uses the second, non-colliding code");
	}

	@Test
	void pendingLeavesAwaitingPaymentWithClientSecret() {
		// Real-Stripe path: the gateway returns Pending, so the booking is created but NOT
		// confirmed synchronously — confirmation comes via the verified webhook (invariant #8).
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(ref, money) -> new PaymentOutcome.Pending("cs_secret_xyz", "pi_42"),
				() -> "CODE999999");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.AwaitingPayment awaiting =
				assertInstanceOf(BookingOutcome.AwaitingPayment.class, outcome);
		assertEquals("cs_secret_xyz", awaiting.clientSecret());
		assertEquals("pi_42", awaiting.paymentIntentId());
		assertEquals(BookingStatus.AWAITING_PAYMENT, awaiting.confirmation().status());
		assertEquals(1, bookings.inserted.size(), "the booking row is created (AWAITING_PAYMENT)");
		assertEquals(0, confirmer.confirmed.size(), "a pending payment confirms nothing synchronously");
	}

	@Test
	void persistsBeforePayingThenAwaits() {
		// AC-2 / R-3: the booking + claim are committed BEFORE checkout.pay is called, so the Stripe
		// PaymentIntent creation holds no (set, date) row lock. Capture the persisted-row count at the
		// moment pay() is invoked to prove the ordering.
		int[] insertedAtPayTime = {-1};
		CheckoutPort capturingCheckout = (ref, money) -> {
			insertedAtPayTime[0] = bookings.inserted.size();
			return new PaymentOutcome.Pending("cs_secret_xyz", "pi_42");
		};
		CreateBookingService service = service(set("ONLINE"), claiming(ClaimOutcome.CLAIMED),
				capturingCheckout, () -> "CODE12345A");

		BookingOutcome outcome = service.create(command());

		assertInstanceOf(BookingOutcome.AwaitingPayment.class, outcome);
		assertEquals(1, insertedAtPayTime[0],
				"the booking row is inserted before checkout.pay runs (the network call is last)");
		// NB: this unit proves the insert→pay ORDERING; that the reserve transaction actually COMMITS
		// (releasing the lock) before pay is proven structurally (ReserveSetService is a separate
		// @Transactional bean) and end-to-end by CreateBookingStripeProfileIT.
	}

	@Test
	void compensatesWhenConfirmFailsAfterCommit() {
		// The Succeeded (stub) path confirms AFTER the reserve commit, so a confirm failure would
		// otherwise strand the booking AWAITING_PAYMENT holding the set (the default profile has no TTL
		// sweep). The collect phase must compensate symmetrically with the Failed branch.
		ConfirmBooking failingConfirm = new ConfirmBooking() {
			@Override
			public void confirm(long bookingId, Instant confirmedAt) {
				throw new IllegalStateException("confirm blew up after commit");
			}

			@Override
			public boolean confirmFromPayment(long bookingId, Instant confirmedAt) {
				return false;
			}
		};
		VenueCatalog catalog = new FakeCatalog(set("ONLINE"));
		CustomerDirectory customers = contact -> new CustomerId(7);
		ReserveSetService reservation = new ReserveSetService(catalog, claiming(ClaimOutcome.CLAIMED),
				customers, bookings, () -> "CODE12345C", new BookingCutoff(CLOCK));
		CreateBookingService service = new CreateBookingService(reservation,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), failingConfirm, release, CLOCK);

		assertThrows(IllegalStateException.class, () -> service.create(command()));
		assertEquals(1, release.released.size(),
				"a confirm failure after commit compensates by releasing the claim");
	}

	@Test
	void rejectsTakenSetWithoutPersisting() {
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.ALREADY_TAKEN),
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> "X");

		assertSame(BookingOutcome.Rejected.SET_TAKEN, service.create(command()));
		assertFalse(bookings.inserted.size() > 0, "a lost claim must create no booking row");
	}

	@Test
	void compensatesByReleasingWhenPaymentFails() {
		// AC-3: the booking + claim are already committed when PI creation fails (the gateway returns
		// Failed). The Failed branch must compensate — release the claim (the #51 ReleaseAbandonedBooking
		// guarded cancel + free) — and surface the failure, never leaving an orphaned AWAITING_PAYMENT.
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(ref, money) -> new PaymentOutcome.Failed("stripe_error"), () -> "CODEX12345");

		assertThrows(PaymentDeclinedException.class, () -> service.create(command()));
		assertEquals(1, bookings.inserted.size(), "the booking was persisted before the failed payment");
		assertEquals(1, release.released.size(), "a failed payment triggers exactly one compensating release");
		assertFalse(confirmer.confirmed.size() > 0, "a failed payment confirms nothing");
	}

	@Test
	void rejectsWalkInPool() {
		CreateBookingService service = service(set("WALK_IN"),
				claiming(ClaimOutcome.CLAIMED),
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		assertSame(BookingOutcome.Rejected.NOT_ONLINE_POOL, service.create(command()));
	}

	@Test
	void rejectsUnknownSet() {
		CreateBookingService service = service(null,
				claiming(ClaimOutcome.CLAIMED),
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		assertSame(BookingOutcome.Rejected.NO_SUCH_SET, service.create(command()));
	}

	@Test
	void rejectsAfterCutoff() {
		// now (2026-11-01) is fine for DATE; use a past date to trip the cutoff.
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
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
					claiming(ClaimOutcome.CLAIMED),
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
		private long nextId = 1000;

		@Override
		public java.util.OptionalLong insertAwaitingPayment(NewBooking booking) {
			inserted.add(booking);
			return java.util.OptionalLong.of(++nextId);
		}

		@Override
		public ConfirmedBooking confirm(long bookingId, Instant confirmedAt) {
			return null; // unused: confirmation flows through the ConfirmBooking seam, not this port
		}

		@Override
		public Optional<ConfirmedBooking> confirmFromPayment(long bookingId, Instant confirmedAt) {
			return Optional.empty();
		}

		@Override
		public Optional<ClaimRef> cancelAwaitingPayment(long bookingId) {
			return Optional.empty();
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.out.BookingRecord> findByCode(String code) {
			return Optional.empty();
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.out.CancelledBooking> cancelConfirmed(
				long bookingId, Instant cancelledAt, long refundMinor,
				ai.riviera.platform.booking.api.RefundReason reason) {
			return Optional.empty();
		}

		@Override
		public List<ai.riviera.platform.booking.application.in.DailyBooking> findConfirmedForVenueOn(
				ai.riviera.platform.venue.api.VenueId venueId, java.time.LocalDate date) {
			return List.of();
		}

		@Override
		public List<ai.riviera.platform.booking.api.BookingId> findExpirableAwaitingPayment(
				Instant olderThan) {
			return List.of();
		}
	}

	/** Captures confirmations driven through the {@link ConfirmBooking} seam (the stub path). */
	private static final class RecordingConfirm implements ConfirmBooking {
		final List<Long> confirmed = new ArrayList<>();

		@Override
		public void confirm(long bookingId, Instant confirmedAt) {
			confirmed.add(bookingId);
		}

		@Override
		public boolean confirmFromPayment(long bookingId, Instant confirmedAt) {
			confirmed.add(bookingId);
			return true;
		}
	}

	/** Captures compensating releases (the #51 seam reused on the payment-failure path). */
	private static final class RecordingRelease implements ReleaseAbandonedBooking {
		final List<BookingId> released = new ArrayList<>();

		@Override
		public boolean release(BookingId bookingId) {
			released.add(bookingId);
			return true;
		}
	}

	/** VenueCatalog fake returning a configured set (or empty for "no such set"). */
	private record FakeCatalog(SetBookingInfo info) implements VenueCatalog {
		@Override
		public Optional<VenueMapView> findVenueMap(VenueId id, LocalDate date) {
			return Optional.empty();
		}

		@Override
		public java.util.List<ai.riviera.platform.venue.api.VenueSummaryView> listVenues(
				ai.riviera.platform.venue.api.VenueFilter filter, LocalDate date) {
			return java.util.List.of();
		}

		@Override
		public Optional<String> poolOf(SetId setId) {
			return Optional.ofNullable(info).map(SetBookingInfo::pool);
		}

		@Override
		public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
			return Optional.ofNullable(info);
		}

		@Override
		public java.util.OptionalInt commissionBps(VenueId id) {
			return java.util.OptionalInt.empty();
		}

		@Override
		public java.util.OptionalInt lateCancelRefundBps(VenueId id) {
			return java.util.OptionalInt.empty();
		}
	}
}
