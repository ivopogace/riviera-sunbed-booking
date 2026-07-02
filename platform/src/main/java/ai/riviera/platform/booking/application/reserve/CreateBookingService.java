package ai.riviera.platform.booking.application.reserve;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The Instant-Book use case (issue #6), now <strong>two-phase</strong> to keep the Stripe network
 * call out of the locked availability transaction (issue #52, risk R-3):
 *
 * <ol>
 * <li><strong>Reserve (committed):</strong> {@link ReserveSetService#reserve} validates, claims the
 *     {@code (set, date)} (invariant #2), and inserts the {@code AWAITING_PAYMENT} booking in one
 *     transaction that <em>commits</em> — releasing the claim row lock.</li>
 * <li><strong>Collect (no transaction):</strong> {@link CheckoutPort#pay} is called here, after the
 *     commit, so a slow/failing Stripe never holds the lock (or a pooled connection) for its
 *     timeout.</li>
 * </ol>
 *
 * <p>Outcome mapping (invariant #8 unchanged — the webhook stays the source of truth):
 * <ul>
 * <li>{@code Succeeded} (in-process stub): confirm now via the {@link ConfirmBooking} seam (its own
 *     transaction; publishes {@code BookingConfirmed}) → {@code Confirmed}. A confirm failure here is
 *     compensated the same way as {@code Failed} (release the claim, then rethrow), since confirm runs
 *     after the reserve commit.</li>
 * <li>{@code Pending} (real Stripe): the booking stays {@code AWAITING_PAYMENT}; the verified
 *     webhook confirms it later, never the client → {@code AwaitingPayment}.</li>
 * <li>{@code Failed} (PI creation failed after commit): <strong>compensate</strong> — reuse the
 *     #51 {@link ReleaseAbandonedBooking} (guarded {@code AWAITING_PAYMENT → CANCELLED} + claim
 *     release) so the booking isn't left orphaned holding the set, then surface the failure. The
 *     #51 TTL sweep is the backstop if this process dies before compensating.</li>
 * </ul>
 *
 * <p>Package-private — the public seam is the {@link CreateBooking} port (invariant #11).
 */
@Service
class CreateBookingService implements CreateBooking {

	private static final Logger log = LoggerFactory.getLogger(CreateBookingService.class);

	private final ReserveSetService reservation;
	private final CheckoutPort checkout;
	private final ConfirmBooking confirmBooking;
	private final ReleaseAbandonedBooking releaseAbandoned;
	private final Clock clock;

	CreateBookingService(ReserveSetService reservation, CheckoutPort checkout,
			ConfirmBooking confirmBooking, ReleaseAbandonedBooking releaseAbandoned, Clock clock) {
		this.reservation = reservation;
		this.checkout = checkout;
		this.confirmBooking = confirmBooking;
		this.releaseAbandoned = releaseAbandoned;
		this.clock = clock;
	}

	@Override
	public BookingOutcome create(CreateBookingCommand command) {
		ReserveOutcome reserved = reservation.reserve(command);
		return switch (reserved) {
			case ReserveOutcome.Rejected rejected -> rejected.reason();
			case ReserveOutcome.Reserved r -> collect(r, command);
			// Request-to-Book (issue #98): the request holds the set but there is NO collect phase —
			// no PaymentIntent, no charge, until the venue accepts (payment-request-on-accept).
			case ReserveOutcome.RequestPending pending -> {
				log.info("pending request {} for set {} on {} (expires {})", pending.bookingId(),
						pending.set().setId().value(), command.bookingDate(),
						pending.requestExpiresAt());
				yield new BookingOutcome.Requested(
						new BookingConfirmation(pending.code(), BookingStatus.PENDING_REQUEST,
								pending.set(), command.bookingDate()),
						pending.requestExpiresAt());
			}
		};
	}

	/**
	 * Collect for an already-committed booking. Runs <strong>outside</strong> any transaction (R-3):
	 * the {@code (set, date)} claim is committed, so the Stripe PaymentIntent creation holds no row
	 * lock. Logs ids/date only — never the booking code (invariant #7) or guest PII.
	 */
	private BookingOutcome collect(ReserveOutcome.Reserved reserved, CreateBookingCommand command) {
		SetBookingInfo set = reserved.set();
		PaymentOutcome payment = checkout.pay(new BookingRef(reserved.bookingId()),
				new Money(set.price().minorUnits(), set.price().currency()));
		return switch (payment) {
			case PaymentOutcome.Succeeded ignored -> {
				// In-process stub: collected synchronously, confirm now (own transaction). The confirm
				// seam transitions and publishes BookingConfirmed (one place, both paths). Because confirm
				// runs AFTER the reserve commit, a failure here would otherwise strand the booking
				// AWAITING_PAYMENT holding the set (the default profile has no TTL sweep) — so compensate
				// symmetrically with the Failed branch before rethrowing (release is a no-op if confirm
				// actually committed, since its guard matches only AWAITING_PAYMENT).
				try {
					confirmBooking.confirm(reserved.bookingId(), clock.instant());
				}
				catch (RuntimeException confirmFailed) {
					releaseAbandoned.release(new BookingId(reserved.bookingId()));
					throw confirmFailed;
				}
				log.info("confirmed booking {} for set {} on {}", reserved.bookingId(),
						set.setId().value(), command.bookingDate());
				yield new BookingOutcome.Confirmed(new BookingConfirmation(
						reserved.code(), BookingStatus.CONFIRMED, set, command.bookingDate()));
			}
			case PaymentOutcome.Pending pending -> {
				// Real Stripe: a PaymentIntent exists; the booking stays AWAITING_PAYMENT and is
				// confirmed only by the signature-verified webhook (invariant #8), never here.
				log.info("awaiting payment for booking {} (set {} on {})", reserved.bookingId(),
						set.setId().value(), command.bookingDate());
				yield new BookingOutcome.AwaitingPayment(
						new BookingConfirmation(reserved.code(), BookingStatus.AWAITING_PAYMENT, set,
								command.bookingDate()),
						pending.clientSecret(), pending.paymentIntentId());
			}
			case PaymentOutcome.Failed failed -> {
				// PI creation failed after the booking + claim committed — compensate so the set isn't
				// left held by an unpaid booking (the same #51 guarded cancel + release the webhook and
				// the TTL sweep use; the sweep backstops a crash before this runs).
				releaseAbandoned.release(new BookingId(reserved.bookingId()));
				log.info("released claim for booking {} after payment initiation failed (set {} on {})",
						reserved.bookingId(), set.setId().value(), command.bookingDate());
				throw new PaymentDeclinedException(failed.reason());
			}
		};
	}
}
