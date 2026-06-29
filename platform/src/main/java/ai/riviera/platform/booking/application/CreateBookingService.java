package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.api.ClaimOutcome;
import ai.riviera.platform.booking.application.in.BookingConfirmation;
import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.CreateBooking;
import ai.riviera.platform.booking.application.in.CreateBookingCommand;
import ai.riviera.platform.booking.application.out.BookingCodeGenerator;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.NewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.customer.api.CustomerId;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.VenueCatalog;

/**
 * The Instant-Book use case (issue #6). Orchestrates four sibling modules <em>only through
 * their {@code api/} ports</em> (invariant #11): reads the set's pool/price/cutoff from
 * {@link VenueCatalog}, enforces the pool (invariant #3) and evening-before cutoff (invariant
 * #4), claims the {@code (set, date)} via {@link AvailabilityClaim} (the double-booking guard,
 * invariant #2), resolves the guest via {@link ai.riviera.platform.customer.api.CustomerDirectory},
 * collects via {@link CheckoutPort} (stub in U3), and persists/confirms the booking.
 *
 * <p><strong>Transaction:</strong> the method is {@code @Transactional}, and the availability
 * claim (propagation {@code REQUIRED}) <em>joins</em> this transaction — so any failure after
 * the claim (a payment decline, a persistence error) rolls the claim back too: a set is never
 * left held for a booking that didn't complete (risk R-2). The stub gateway is in-process, so
 * holding the transaction across it is safe; U4 moves confirmation onto the verified webhook.
 *
 * <p>Package-private — the public seam is the {@link CreateBooking} port (invariant #11). One
 * implementation, but the port gives the web adapter a clean, mockable entry point.
 */
@Service
class CreateBookingService implements CreateBooking {

	private static final String ONLINE_POOL = "ONLINE";
	private static final int MAX_CODE_ATTEMPTS = 5;

	private static final Logger log = LoggerFactory.getLogger(CreateBookingService.class);

	private final VenueCatalog venueCatalog;
	private final AvailabilityClaim availability;
	private final ai.riviera.platform.customer.api.CustomerDirectory customers;
	private final CheckoutPort checkout;
	private final Bookings bookings;
	private final BookingCodeGenerator codeGenerator;
	private final BookingCutoff cutoff;
	private final Clock clock;

	CreateBookingService(VenueCatalog venueCatalog, AvailabilityClaim availability,
			ai.riviera.platform.customer.api.CustomerDirectory customers, CheckoutPort checkout,
			Bookings bookings, BookingCodeGenerator codeGenerator, BookingCutoff cutoff, Clock clock) {
		this.venueCatalog = venueCatalog;
		this.availability = availability;
		this.customers = customers;
		this.checkout = checkout;
		this.bookings = bookings;
		this.codeGenerator = codeGenerator;
		this.cutoff = cutoff;
		this.clock = clock;
	}

	@Override
	@Transactional
	public BookingOutcome create(CreateBookingCommand command) {
		Optional<SetBookingInfo> found = venueCatalog.setBookingInfo(command.setId());
		if (found.isEmpty()) {
			return BookingOutcome.Rejected.NO_SUCH_SET;
		}
		SetBookingInfo set = found.get();
		if (!ONLINE_POOL.equals(set.pool())) {
			return BookingOutcome.Rejected.NOT_ONLINE_POOL;
		}
		if (!cutoff.isBookable(set.bookingCutoff(), command.bookingDate())) {
			return BookingOutcome.Rejected.BOOKING_CLOSED;
		}

		ClaimOutcome claim = availability.claim(command.setId(), command.bookingDate());
		switch (claim) {
			case ALREADY_TAKEN -> { return BookingOutcome.Rejected.SET_TAKEN; }
			case NOT_ONLINE_POOL -> { return BookingOutcome.Rejected.NOT_ONLINE_POOL; }
			case NO_SUCH_SET -> { return BookingOutcome.Rejected.NO_SUCH_SET; }
			case CLAIMED -> { /* won the claim — proceed */ }
		}

		CustomerId customerId = customers.findOrCreate(command.contact());
		Inserted inserted = insertWithUniqueCode(set, customerId, command);

		PaymentOutcome payment = checkout.pay(new BookingRef(inserted.id()),
				new Money(set.price().minorUnits(), set.price().currency()));
		if (payment instanceof PaymentOutcome.Failed failed) {
			throw new PaymentDeclinedException(failed.reason()); // rolls back the claim too
		}

		bookings.confirm(inserted.id(), clock.instant());
		// Log ids/date only — never the booking code (invariant #7) or the guest's PII.
		log.info("confirmed booking {} for set {} on {}", inserted.id(), set.setId().value(),
				command.bookingDate());

		return new BookingOutcome.Confirmed(new BookingConfirmation(
				inserted.code(), BookingStatus.CONFIRMED, set, command.bookingDate()));
	}

	/**
	 * Insert the booking, regenerating the code on the astronomically-unlikely
	 * {@code UNIQUE(code)} collision (invariant #7). Bounded retries; rethrow if a
	 * non-recoverable integrity error persists.
	 */
	private Inserted insertWithUniqueCode(SetBookingInfo set, CustomerId customerId,
			CreateBookingCommand command) {
		DataIntegrityViolationException last = null;
		for (int attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
			String code = codeGenerator.next();
			try {
				long id = bookings.insertAwaitingPayment(new NewBooking(code, set.venueId(),
						set.setId(), customerId, command.bookingDate(), set.price().minorUnits(),
						set.price().currency()));
				return new Inserted(id, code);
			}
			catch (DataIntegrityViolationException e) {
				last = e; // retry with a fresh code
			}
		}
		throw last;
	}

	private record Inserted(long id, String code) {
	}
}
