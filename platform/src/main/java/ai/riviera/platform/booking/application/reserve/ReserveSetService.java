package ai.riviera.platform.booking.application.reserve;

import ai.riviera.platform.booking.application.cancel.BookingCutoff;

import java.util.Optional;
import java.util.OptionalLong;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.api.ClaimOutcome;
import ai.riviera.platform.booking.application.BookingCodeGenerator;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.api.CustomerId;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.SetBookingFacts;

/**
 * The committed <em>reserve</em> phase of Instant-Book (issue #52): validate the set (online pool,
 * invariant #3; evening-before cutoff, invariant #4), claim the {@code (set, date)} (the
 * double-booking guard, invariant #2), resolve the guest, and insert the {@code AWAITING_PAYMENT}
 * booking — all in <strong>one transaction that commits before any payment call</strong>. Splitting
 * this off from {@link CreateBookingService} is precisely what lets the Stripe PaymentIntent be
 * created <em>after</em> commit, so the claim row lock is never held across the Stripe network
 * round-trip (risk R-3 from #8).
 *
 * <p><strong>Transaction:</strong> the availability claim (propagation {@code REQUIRED}) joins this
 * {@code @Transactional} method, so a failure between the claim and the insert rolls the claim back
 * too — a set is never held for a booking that wasn't created (risk R-2). Invariant #2 is upheld by
 * the DB {@code UNIQUE(set_id, booking_date)} + atomic {@code INSERT … ON CONFLICT} claim, which is
 * independent of how long the lock is held — so committing before payment does not weaken it.
 *
 * <p>Package-private, no interface — a single internal collaborator of {@code CreateBookingService}
 * (riviera-java-conventions: don't invent a port for one impl), not a published seam (invariant #11).
 */
@Service
class ReserveSetService {

	private static final String ONLINE_POOL = "ONLINE";
	private static final int MAX_CODE_ATTEMPTS = 5;

	private final SetBookingFacts setFacts;
	private final AvailabilityClaim availability;
	private final CustomerDirectory customers;
	private final Bookings bookings;
	private final BookingCodeGenerator codeGenerator;
	private final BookingCutoff cutoff;

	ReserveSetService(SetBookingFacts setFacts, AvailabilityClaim availability,
			CustomerDirectory customers, Bookings bookings, BookingCodeGenerator codeGenerator,
			BookingCutoff cutoff) {
		this.setFacts = setFacts;
		this.availability = availability;
		this.customers = customers;
		this.bookings = bookings;
		this.codeGenerator = codeGenerator;
		this.cutoff = cutoff;
	}

	/**
	 * Validate, claim, and persist the {@code AWAITING_PAYMENT} booking in one committed transaction.
	 * On return the {@code (set, date)} is held and the row lock released — the caller pays outside
	 * any transaction.
	 */
	@Transactional
	ReserveOutcome reserve(CreateBookingCommand command) {
		Optional<SetBookingInfo> found = setFacts.setBookingInfo(command.setId());
		if (found.isEmpty()) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET);
		}
		SetBookingInfo set = found.get();
		if (!ONLINE_POOL.equals(set.pool())) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NOT_ONLINE_POOL);
		}
		if (!cutoff.isBookable(set.bookingCutoff(), command.bookingDate())) {
			return new ReserveOutcome.Rejected(BookingOutcome.Rejected.BOOKING_CLOSED);
		}

		ClaimOutcome claim = availability.claim(command.setId(), command.bookingDate());
		switch (claim) {
			case ALREADY_TAKEN -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN); }
			case NOT_ONLINE_POOL -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NOT_ONLINE_POOL); }
			case NO_SUCH_SET -> { return new ReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET); }
			case CLAIMED -> { /* won the claim — proceed */ }
		}

		CustomerId customerId = customers.findOrCreate(command.contact());
		Inserted inserted = insertWithUniqueCode(set, customerId, command);
		return new ReserveOutcome.Reserved(inserted.id(), inserted.code(), set);
	}

	/**
	 * Insert the booking, regenerating the code on the astronomically-unlikely {@code UNIQUE(code)}
	 * collision (invariant #7). The insert is an atomic {@code ON CONFLICT (code) DO NOTHING}, so a
	 * collision returns empty (a normal retry signal) rather than throwing and poisoning the
	 * transaction. Bounded retries.
	 */
	private Inserted insertWithUniqueCode(SetBookingInfo set, CustomerId customerId,
			CreateBookingCommand command) {
		for (int attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
			String code = codeGenerator.next();
			OptionalLong id = bookings.insertAwaitingPayment(new NewBooking(code, set.venueId(),
					set.setId(), customerId, command.bookingDate(), set.price().minorUnits(),
					set.price().currency()));
			if (id.isPresent()) {
				return new Inserted(id.getAsLong(), code);
			}
		}
		throw new IllegalStateException(
				"could not generate a unique booking code after " + MAX_CODE_ATTEMPTS + " attempts");
	}

	private record Inserted(long id, String code) {
	}
}
