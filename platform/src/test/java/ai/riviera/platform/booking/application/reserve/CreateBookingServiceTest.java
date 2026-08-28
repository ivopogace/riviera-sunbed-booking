package ai.riviera.platform.booking.application.reserve;

import ai.riviera.platform.booking.application.BookingCutoff;

import java.time.*;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import ai.riviera.platform.booking.application.request.RequestWindows;
import ai.riviera.platform.venue.vocabulary.*;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.BookingCodeGenerator;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.api.SetBookingFacts;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Branch coverage for the Instant-Book orchestration (now two-phase) with
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
	private final RecordingMailDelivery confirmationMail = new RecordingMailDelivery();
	// Default: a gateway that really collects, so the existing cases mean what they always meant.
	private final RecordingCollection collection = new RecordingCollection();
	private final RecordingConfirm confirmer = new RecordingConfirm();
	private final RecordingRelease release = new RecordingRelease();

	private SetBookingInfo set(String pool) {
		return set(pool, BookingMode.INSTANT);
	}

	private SetBookingInfo set(String pool, BookingMode mode) {
		return new SetBookingInfo(SET, new VenueId(1), "Miramar", "Front row", 2, pool,
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0), LocalTime.of(16, 0), mode);
	}

	private static final RequestWindows WINDOWS =
			new RequestWindows(Duration.ofHours(24), Duration.ofHours(12));

	private CreateBookingService service(SetBookingInfo info, AvailabilityClaim claim,
			CheckoutPort checkout, BookingCodeGenerator codes) {
		return service(info, claim, checkout, codes, true);
	}

	private CreateBookingService service(SetBookingInfo info, AvailabilityClaim claim,
			CheckoutPort checkout, BookingCodeGenerator codes, boolean venueVisible) {
		return service(info, claim, checkout, codes, venueVisible, CLOCK);
	}

	private CreateBookingService service(SetBookingInfo info, AvailabilityClaim claim,
			CheckoutPort checkout, BookingCodeGenerator codes, boolean venueVisible, Clock clock) {
		SetBookingFacts catalog = new FakeCatalog(info);
		CustomerDirectory customers = _ -> new CustomerId(99);
		ReserveSetService reservation = new ReserveSetService(catalog, claim, visibility(venueVisible),
				customers, bookings, codes, new BookingCutoff(clock), WINDOWS, clock);
		return new CreateBookingService(reservation, checkout, confirmer, release, confirmationMail,
				collection, clock);
	}

	private CreateBookingCommand command() {
		return new CreateBookingCommand(SET, DATE, GUEST);
	}

	/** A fake claim port (AvailabilityClaim is no longer a single-method since U4's release). */
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
				(_, _) -> new PaymentOutcome.Succeeded("ok"),
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
	void flagsWithheldConfirmationMailOnInstantConfirm() {
		// The instant-confirm response is built before the after-commit mail listener runs, so
		// the flag can only come from asking whether the mail WOULD be withheld — never from the send.
		confirmationMail.withheld = true;
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"),
				() -> "CODE123456");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertTrue(confirmed.confirmation().emailWithheld(), "the guest is told no email is coming");
		assertEquals(List.of(new CustomerId(99)), confirmationMail.asked, "asked about that guest");
	}

	@Test
	void reportsADeliverableConfirmationMailAsNotWithheld() {
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"),
				() -> "CODE123456");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertFalse(confirmed.confirmation().emailWithheld());
	}

	@Test
	void neverAsksAboutTheConfirmationMailWhenTheGatewayCollectedNothing() {
		// The in-process stub answers Succeeded without taking money, so this 201 CONFIRMED is NOT
		// post-payment and the flag would be a free suppression oracle for any address.
		collection.proven = false;
		confirmationMail.withheld = true;
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"),
				() -> "CODE123456");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Confirmed confirmed = assertInstanceOf(BookingOutcome.Confirmed.class, outcome);
		assertFalse(confirmed.confirmation().emailWithheld());
		assertTrue(confirmationMail.asked.isEmpty(), "no oracle where confirmation isn't payment");
	}

	@Test
	void neverAsksAboutTheConfirmationMailBeforePayment() {
		// The 202 hands the code out BEFORE the card is collected, so asking here would leak
		// suppression status for any address a checkout can be started with (D-8).
		confirmationMail.withheld = true;
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Pending("cs_test", "pi_test"),
				() -> "CODE123456");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.AwaitingPayment awaiting =
				assertInstanceOf(BookingOutcome.AwaitingPayment.class, outcome);
		assertFalse(awaiting.confirmation().emailWithheld());
		assertTrue(confirmationMail.asked.isEmpty(), "no suppression oracle before payment");
	}

	@Test
	void neverAsksAboutTheConfirmationMailForAPendingRequest() {
		confirmationMail.withheld = true;
		CreateBookingService service = service(set("ONLINE", BookingMode.REQUEST),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"),
				() -> "CODE123456");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Requested requested = assertInstanceOf(BookingOutcome.Requested.class, outcome);
		assertFalse(requested.confirmation().emailWithheld());
		assertTrue(confirmationMail.asked.isEmpty(), "no suppression oracle before payment");
	}

	@Test
	void regeneratesCodeOnCollisionAndConfirms() {
		// First insert "collides" (empty), second succeeds — the booking must still confirm with
		// the second code (proves the ON CONFLICT retry actually recovers).
		java.util.List<String> codes = new ArrayList<>(java.util.List.of("DUPCODE0001", "FRESHCODE02"));
		var collidingOnce = new RecordingBookings() {
			boolean first = true;

			@Override
			public java.util.OptionalLong insertAwaitingPayment(NewBooking booking) {
				if (first) {
					first = false;
					return java.util.OptionalLong.empty();
				}
				return java.util.OptionalLong.of(1234L);
			}
		};
		SetBookingFacts catalog = new FakeCatalog(set("ONLINE"));
		CustomerDirectory customers = _ -> new CustomerId(1);
		ReserveSetService reservation = new ReserveSetService(catalog, claiming(ClaimOutcome.CLAIMED),
				visibility(true), customers, collidingOnce, codes::removeFirst,
				new BookingCutoff(CLOCK), WINDOWS, CLOCK);
		var service = new CreateBookingService(reservation,
				(_, _) -> new PaymentOutcome.Succeeded("ok"), confirmer, release, confirmationMail,
				collection, CLOCK);

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
				(_, _) -> new PaymentOutcome.Pending("cs_secret_xyz", "pi_42"),
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
		CheckoutPort capturingCheckout = (_, _) -> {
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
		SetBookingFacts catalog = new FakeCatalog(set("ONLINE"));
		CustomerDirectory customers = contact -> new CustomerId(7);
		ReserveSetService reservation = new ReserveSetService(catalog, claiming(ClaimOutcome.CLAIMED),
				visibility(true), customers, bookings, () -> "CODE12345C",
				new BookingCutoff(CLOCK), WINDOWS, CLOCK);
		CreateBookingService service = new CreateBookingService(reservation,
				(ref, money) -> new PaymentOutcome.Succeeded("ok"), failingConfirm, release,
				confirmationMail, collection, CLOCK);

		assertThrows(IllegalStateException.class, () -> service.create(command()));
		assertEquals(1, release.released.size(),
				"a confirm failure after commit compensates by releasing the claim");
	}

	@Test
	void requestModeCreatesPendingRequestWithoutPayment() {
		// AC-1: a REQUEST venue's booking is created PENDING_REQUEST and the payment gateway is
		// NEVER invoked — no PaymentIntent, no charge, until the venue accepts.
		boolean[] paymentTouched = {false};
		CheckoutPort neverPay = (ref, money) -> {
			paymentTouched[0] = true;
			throw new AssertionError("a pending request must not initiate payment");
		};
		CreateBookingService service = service(
				set("ONLINE", ai.riviera.platform.venue.vocabulary.BookingMode.REQUEST),
				claiming(ClaimOutcome.CLAIMED), neverPay, () -> "REQCODE001");

		BookingOutcome outcome = service.create(command());

		BookingOutcome.Requested requested = assertInstanceOf(BookingOutcome.Requested.class, outcome);
		assertEquals("REQCODE001", requested.confirmation().code());
		assertEquals(BookingStatus.PENDING_REQUEST, requested.confirmation().status());
		assertFalse(paymentTouched[0], "no CheckoutPort call for a pending request");
		assertEquals(0, bookings.inserted.size(), "no AWAITING_PAYMENT row for a request");
		assertEquals(1, bookings.pendingInserted.size(), "exactly one PENDING_REQUEST row");
		assertEquals(0, confirmer.confirmed.size(), "nothing is confirmed at request time");
		// Deadline: now + 24h is well before the 2026-11-30 17:00Z cutoff instant, so uncapped.
		assertEquals(Instant.parse("2026-11-02T09:00:00Z"), requested.requestExpiresAt());
		assertEquals(requested.requestExpiresAt(), bookings.lastRequestExpiresAt,
				"the stored deadline is the one returned to the guest");
	}

	@Test
	void requestDeadlineUncappedTwoDaysOut() {
		// The accept deadline caps at D's sales close, far enough off two days out to stay uncapped.
		CreateBookingService service = service(
				set("ONLINE", BookingMode.REQUEST),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("unused"), () -> "REQCODE002");

		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 11, 3), GUEST));

		BookingOutcome.Requested requested = assertInstanceOf(BookingOutcome.Requested.class, outcome);
		assertEquals(Instant.parse("2026-11-02T09:00:00Z"), requested.requestExpiresAt(),
				"uncapped: now + 24h is well before D's 00:00 Europe/Tirane open");
	}

	@Test
	void rejectsTakenSetWithoutPersisting() {
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.ALREADY_TAKEN),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "X");

		assertSame(BookingOutcome.Rejected.SET_TAKEN, service.create(command()));
        assertTrue(bookings.inserted.isEmpty(), "a lost claim must create no booking row");
	}

	@Test
	void compensatesByReleasingWhenPaymentFails() {
		// AC-3: the booking + claim are already committed when PI creation fails (the gateway returns
		// Failed). The Failed branch must compensate — release the claim (the ReleaseAbandonedBooking
		// guarded cancel + free) — and surface the failure, never leaving an orphaned AWAITING_PAYMENT.
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Failed("stripe_error"), () -> "CODEX12345");

		assertThrows(PaymentDeclinedException.class, () -> service.create(command()));
		assertEquals(1, bookings.inserted.size(), "the booking was persisted before the failed payment");
		assertEquals(1, release.released.size(), "a failed payment triggers exactly one compensating release");
        assertTrue(confirmer.confirmed.isEmpty(), "a failed payment confirms nothing");
	}

	@Test
	void compensatesByReleasingWhenPaymentThrows() {
		// A RAW throw from pay (not the typed Failed) — e.g. the payment-row insert failing after
		// Stripe created the intent — must still compensate: release the committed claim, then rethrow,
		// never leaving an orphaned AWAITING_PAYMENT booking holding the set with no payment row.
		CheckoutPort throwingCheckout = (_, _) -> {
			throw new org.springframework.dao.DataAccessResourceFailureException("register blew up after intent");
		};
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED), throwingCheckout, () -> "CODETHROW01");

		assertThrows(org.springframework.dao.DataAccessResourceFailureException.class,
				() -> service.create(command()));
		assertEquals(1, bookings.inserted.size(), "the booking was persisted before the throwing payment");
		assertEquals(1, release.released.size(), "a thrown payment triggers exactly one compensating release");
		assertTrue(confirmer.confirmed.isEmpty(), "a thrown payment confirms nothing");
	}

	/** A fixed-answer visibility fake (#693) — the real rule lives in operator's JDBC adapter. */
	private static VenueVisibility visibility(boolean visible) {
		return new VenueVisibility() {
			@Override
			public boolean isVisible(VenueRef venue) {
				return visible;
			}

			@Override
			public java.util.Set<VenueRef> visibleAmong(Collection<VenueRef> venues) {
				return visible ? java.util.Set.copyOf(venues) : java.util.Set.of();
			}
		};
	}

	/** A claim port that fails the test if any claim is attempted (#693: refuse before claiming). */
	private static AvailabilityClaim neverClaiming() {
		return new AvailabilityClaim() {
			@Override
			public ClaimOutcome claim(SetId setId, LocalDate bookingDate) {
				throw new AssertionError("claim must not be attempted for a hidden venue");
			}

			@Override
			public void release(SetId setId, LocalDate bookingDate) {
				throw new AssertionError("release must not be attempted for a hidden venue");
			}
		};
	}

	@Test
	void instantReserveRefusedForHiddenVenue() {
		CreateBookingService service = service(set("ONLINE"), neverClaiming(),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "X", false);

		assertSame(BookingOutcome.Rejected.NO_SUCH_SET, service.create(command()));
		assertTrue(bookings.inserted.isEmpty(), "no booking row for a hidden venue");
	}

	@Test
	void requestReserveRefusedForHiddenVenue() {
		CreateBookingService service = service(set("ONLINE", BookingMode.REQUEST), neverClaiming(),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "X", false);

		assertSame(BookingOutcome.Rejected.NO_SUCH_SET, service.create(command()));
		assertTrue(bookings.inserted.isEmpty(), "no pending request for a hidden venue");
	}

	@Test
	void rejectsWalkInPool() {
		CreateBookingService service = service(set("WALK_IN"),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		assertSame(BookingOutcome.Rejected.NOT_ONLINE_POOL, service.create(command()));
	}

	@Test
	void rejectsUnknownSet() {
		CreateBookingService service = service(null,
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		assertSame(BookingOutcome.Rejected.NO_SUCH_SET, service.create(command()));
	}

	@Test
	void rejectsAfterCutoff() {
		// now (2026-11-01) is fine for DATE; use a past date to trip the cutoff.
		CreateBookingService service = service(set("ONLINE"),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "X");
		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 10, 1), GUEST));
		assertSame(BookingOutcome.Rejected.BOOKING_CLOSED, outcome);
	}

	@Test
	void sameDayInstantReserveBeforeClose() {
		// AC-4: "now" is 10:00 Tirane; a 16:00 sales close still allows booking TODAY (#791).
		Clock beforeClose = Clock.fixed(Instant.parse("2026-11-01T09:00:00Z"), ZoneId.of("UTC"));
		CreateBookingService service = service(set("ONLINE"), claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "CODE234567", true, beforeClose);

		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 11, 1), GUEST));

		assertInstanceOf(BookingOutcome.Confirmed.class, outcome, "same-day reserve + pay succeeds");
	}

	@Test
	void sameDayInstantRejectedAtClose() {
		// AC-4: exactly at the venue's 16:00 sales close (15:00Z = 16:00 CET), the same date is closed.
		Clock atClose = Clock.fixed(Instant.parse("2026-11-01T15:00:00Z"), ZoneId.of("UTC"));
		CreateBookingService service = service(set("ONLINE"), claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> "X", true, atClose);

		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 11, 1), GUEST));

		assertSame(BookingOutcome.Rejected.BOOKING_CLOSED, outcome);
	}

	@Test
	void sameDayRequestSucceedsBeforeSalesClose() {
		// AC-5 (#792): the temporary gate is gone — today is requestable until the venue's close.
		Clock beforeClose = Clock.fixed(Instant.parse("2026-11-01T09:00:00Z"), ZoneId.of("UTC"));
		CreateBookingService service = service(set("ONLINE", BookingMode.REQUEST),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("unused"), () -> "REQCODE004", true, beforeClose);

		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 11, 1), GUEST));

		BookingOutcome.Requested requested = assertInstanceOf(BookingOutcome.Requested.class, outcome);
		assertEquals(Instant.parse("2026-11-01T15:00:00Z"), requested.requestExpiresAt(),
				"a same-day request's deadline caps at today's 16:00 sales close, Europe/Tirane (CET)");
	}

	@Test
	void requestFenceAndDeadlineShareOneClockReading() {
		// A close crossing between two reads would admit a request already past its own deadline.
		var reads = new java.util.concurrent.atomic.AtomicInteger();
		Clock counting = new Clock() {
			@Override
			public ZoneId getZone() {
				return ZoneId.of("UTC");
			}

			@Override
			public Clock withZone(ZoneId zone) {
				return this;
			}

			@Override
			public Instant instant() {
				reads.incrementAndGet();
				return Instant.parse("2026-11-01T09:00:00Z");
			}
		};
		CreateBookingService service = service(set("ONLINE", BookingMode.REQUEST),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("unused"), () -> "REQCODE005", true, counting);

		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 11, 1), GUEST));

		assertInstanceOf(BookingOutcome.Requested.class, outcome);
		assertEquals(1, reads.get(),
				"the sales-close fence and the response deadline must classify the same instant");
	}

	@Test
	void requestDeadlineCappedAtSalesClose() {
		// AC-1 (#792): a near-term request's response deadline caps at D's own sales close.
		Clock eveningBefore = Clock.fixed(Instant.parse("2026-11-01T19:00:00Z"), ZoneId.of("UTC"));
		CreateBookingService service = service(set("ONLINE", BookingMode.REQUEST),
				claiming(ClaimOutcome.CLAIMED),
				(_, _) -> new PaymentOutcome.Succeeded("unused"), () -> "REQCODE003", true, eveningBefore);

		BookingOutcome outcome = service.create(
				new CreateBookingCommand(SET, LocalDate.of(2026, 11, 2), GUEST));

		BookingOutcome.Requested requested = assertInstanceOf(BookingOutcome.Requested.class, outcome);
		assertEquals(Instant.parse("2026-11-02T15:00:00Z"), requested.requestExpiresAt(),
				"capped at the venue's 16:00 sales close on D, Europe/Tirane (CET) — an accept past "
						+ "the close would sell a window the venue has already shut");
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
					(_, _) -> new PaymentOutcome.Succeeded("ok"), () -> code);
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
	private static class RecordingBookings implements Bookings {
		final List<NewBooking> inserted = new ArrayList<>();
		final List<NewBooking> pendingInserted = new ArrayList<>();
		Instant lastRequestExpiresAt;
		private long nextId = 1000;

		@Override
		public java.util.OptionalLong insertAwaitingPayment(NewBooking booking) {
			inserted.add(booking);
			return java.util.OptionalLong.of(++nextId);
		}

		@Override
		public java.util.OptionalLong insertPendingRequest(NewBooking booking, Instant requestExpiresAt) {
			pendingInserted.add(booking);
			lastRequestExpiresAt = requestExpiresAt;
			return java.util.OptionalLong.of(++nextId);
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.checkin.CompletedCheckIn> completeConfirmed(
				String code, ai.riviera.platform.venue.vocabulary.VenueId venueId,
				java.time.LocalDate serviceDate, Instant completedAt) {
			return Optional.empty();
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.checkin.CheckInFacts> findCheckInFacts(
				String code, ai.riviera.platform.venue.vocabulary.VenueId venueId) {
			return Optional.empty();
		}

		@Override
		public int markPastConfirmedAsNoShow(java.time.LocalDate today, int batchSize) {
			return 0;
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.cancel.CancelledBooking> cancelForWeather(
				long bookingId, Instant cancelledAt, long refundMinor) {
			return Optional.empty();
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.request.AcceptedRequest> acceptPendingRequest(
				long bookingId, ai.riviera.platform.venue.vocabulary.VenueId venueId, Instant now) {
			return Optional.empty();
		}

		@Override
		public boolean revertAcceptToPending(long bookingId) {
			return false;
		}

		@Override
		public Optional<ClaimRef> declinePending(long bookingId,
				ai.riviera.platform.venue.vocabulary.VenueId venueId) {
			return Optional.empty();
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.request.RequestSnapshot> requestSnapshot(
				long bookingId, ai.riviera.platform.venue.vocabulary.VenueId venueId) {
			return Optional.empty();
		}

		@Override
		public List<ai.riviera.platform.booking.application.request.PendingRequestRow> findPendingRequestsForVenue(
				ai.riviera.platform.venue.vocabulary.VenueId venueId) {
			return List.of();
		}

		@Override
		public List<ai.riviera.platform.booking.application.view.BookingRecord> findByAccountId(
				ai.riviera.platform.customer.vocabulary.CustomerAccountId accountId) {
			return List.of();
		}

		@Override
		public List<ai.riviera.platform.booking.vocabulary.BookingId> findOverduePendingRequests(Instant now) {
			return List.of();
		}

		@Override
		public Optional<ClaimRef> expirePendingRequest(long bookingId, Instant now) {
			return Optional.empty();
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.request.WithdrawnRequest>
				withdrawPendingRequest(String code) {
			return Optional.empty();
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
		public Optional<ai.riviera.platform.booking.application.view.BookingRecord> findByCode(String code) {
			return Optional.empty();
		}

		@Override
		public Optional<ai.riviera.platform.booking.application.cancel.CancelledBooking> cancelConfirmed(
				long bookingId, Instant cancelledAt, long refundMinor) {
			return Optional.empty();
		}

		@Override
		public List<ai.riviera.platform.booking.application.view.DailyBooking> findSettledForVenueOn(
				ai.riviera.platform.venue.vocabulary.VenueId venueId, java.time.LocalDate date) {
			return List.of();
		}

		@Override
		public List<ai.riviera.platform.booking.application.refund.RefundableBooking> findRefundableForWeather(
				ai.riviera.platform.venue.vocabulary.VenueId venueId, java.time.LocalDate date) {
			return List.of();
		}

		@Override
		public List<ai.riviera.platform.booking.vocabulary.BookingId> findExpirableAwaitingPayment(
				Instant createdBefore, Instant acceptedBefore, java.time.LocalDate serviceDayOnOrBefore) {
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

	/** Captures compensating releases (the seam reused on the payment-failure path). */
	private static final class RecordingRelease implements ReleaseAbandonedBooking {
		final List<BookingId> released = new ArrayList<>();

		@Override
		public boolean release(BookingId bookingId) {
			released.add(bookingId);
			return true;
		}
	}

	/** SetBookingFacts fake returning a configured set (or empty for "no such set"). */
	private record FakeCatalog(SetBookingInfo info) implements SetBookingFacts {
		@Override
		public Optional<String> poolForClaim(SetId setId) {
			return Optional.ofNullable(info).map(SetBookingInfo::pool);
		}

		@Override
		public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
			return Optional.ofNullable(info);
		}

		@Override
		public Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId> setIds) {
			return info == null ? Map.of()
					: setIds.stream().distinct().collect(Collectors.toMap(id -> id, id -> info));
		}
	}

	/**
	 * A {@code ConfirmationMailDelivery} fake that records who was asked — so the confirmed
	 * branch can be shown to carry the answer, and the pre-payment branches to never ask at all.
	 */
	private static final class RecordingMailDelivery
			implements ai.riviera.platform.booking.spi.ConfirmationMailDelivery {

		private final List<CustomerId> asked = new ArrayList<>();
		private boolean withheld;

		@Override
		public boolean isWithheld(CustomerId customerId) {
			asked.add(customerId);
			return withheld;
		}
	}

	/** A {@code CollectionGuarantee} fake — whether this deployment's gateway really collects. */
	private static final class RecordingCollection
			implements ai.riviera.platform.payment.api.CollectionGuarantee {

		private boolean proven = true;

		@Override
		public boolean provenBeforeConfirmation() {
			return proven;
		}
	}
}
