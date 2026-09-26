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
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * Instant Book in two phases, so Stripe never runs inside the locked availability transaction:
 * {@link ReserveSetService#reserve} validates (invariants #3, #4), claims every {@code (set, date)}
 * (invariant #2) and commits the {@code AWAITING_PAYMENT} booking; only then is {@link CheckoutPort#pay}
 * called, with no transaction. {@code Pending} waits for the verified webhook (invariant #8);
 * {@code Failed}, a raw throw from {@code pay} or a failed stub confirm is compensated through
 * {@link ReleaseAbandonedBooking} before surfacing — the TTL sweep backstops a crash.
 */
@Service
class CreateBookingService implements CreateBooking {

	private static final Logger log = LoggerFactory.getLogger(CreateBookingService.class);

	private final ReserveSetService reservation;
	private final CheckoutPort checkout;
	private final ConfirmBooking confirmBooking;
	private final ReleaseAbandonedBooking releaseAbandoned;
	private final ai.riviera.platform.booking.spi.ConfirmationMailDelivery confirmationMail;
	private final ai.riviera.platform.payment.api.CollectionGuarantee collection;
	private final Clock clock;

	CreateBookingService(ReserveSetService reservation, CheckoutPort checkout,
			ConfirmBooking confirmBooking, ReleaseAbandonedBooking releaseAbandoned,
			ai.riviera.platform.booking.spi.ConfirmationMailDelivery confirmationMail,
			ai.riviera.platform.payment.api.CollectionGuarantee collection, Clock clock) {
		this.reservation = reservation;
		this.checkout = checkout;
		this.confirmBooking = confirmBooking;
		this.releaseAbandoned = releaseAbandoned;
		this.confirmationMail = confirmationMail;
		this.collection = collection;
		this.clock = clock;
	}

	@Override
	public BookingOutcome create(CreateBookingCommand command) {
		ReserveOutcome reserved = reservation.reserve(command);
		return switch (reserved) {
			case ReserveOutcome.Rejected rejected -> rejected.reason();
			case ReserveOutcome.Reserved r -> collect(r, command);
			// Request-to-Book: the request holds the set but there is NO collect phase —
			// no PaymentIntent, no charge, until the venue accepts (payment-request-on-accept).
			case ReserveOutcome.RequestPending pending -> {
				log.info("pending request {} for set {} on {} (expires {})", pending.bookingId(),
						pending.set().setId().value(), command.bookingDate(),
						pending.requestExpiresAt());
				yield new BookingOutcome.Requested(
						new BookingConfirmation(pending.code(), BookingStatus.PENDING_REQUEST,
								pending.set(), command.bookingDate(), command.lastDate(),
								new MoneyView(pending.amountMinor(), pending.set().price().currency()), false),
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
		MoneyView amount = new MoneyView(reserved.amountMinor(), set.price().currency());
		PaymentOutcome payment;
		try {
			payment = checkout.pay(new BookingRef(reserved.bookingId()),
					new Money(reserved.amountMinor(), set.price().currency()));
		}
		catch (RuntimeException paymentBlewUp) {
			// Not just the typed Failed — an unexpected throw (e.g. the payment-row insert failing
			// after Stripe created the intent) would otherwise strand the booking AWAITING_PAYMENT holding
			// the set. Release the committed claim (same seam as the Failed branch), then rethrow.
			releaseAbandoned.release(new BookingId(reserved.bookingId()));
			throw paymentBlewUp;
		}
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
				// Same gate as the code-gated view: only a gateway that actually collects before
				// confirming makes this post-payment, so the stub's synchronous Succeeded discloses
				// nothing. Today no shipped gateway both collects AND confirms in-process, so
				// this branch is unreachable-but-correct rather than dead by construction.
				boolean emailWithheld = collection.provenBeforeConfirmation()
						&& confirmationMail.isWithheld(reserved.customerId());
				yield new BookingOutcome.Confirmed(new BookingConfirmation(
						reserved.code(), BookingStatus.CONFIRMED, set, command.bookingDate(),
						command.lastDate(), amount, emailWithheld));
			}
			case PaymentOutcome.Pending pending -> {
				// Real Stripe: a PaymentIntent exists; the booking stays AWAITING_PAYMENT and is
				// confirmed only by the signature-verified webhook (invariant #8), never here.
				log.info("awaiting payment for booking {} (set {} on {})", reserved.bookingId(),
						set.setId().value(), command.bookingDate());
				yield new BookingOutcome.AwaitingPayment(
						new BookingConfirmation(reserved.code(), BookingStatus.AWAITING_PAYMENT, set,
								command.bookingDate(), command.lastDate(), amount, false),
						pending.clientSecret(), pending.paymentIntentId());
			}
			case PaymentOutcome.Failed failed -> {
				// PI creation failed after the booking + claim committed — compensate so the set isn't
				// left held by an unpaid booking (the same guarded cancel + release the webhook and
				// the TTL sweep use; the sweep backstops a crash before this runs).
				releaseAbandoned.release(new BookingId(reserved.bookingId()));
				log.info("released claim for booking {} after payment initiation failed (set {} on {})",
						reserved.bookingId(), set.setId().value(), command.bookingDate());
				throw new PaymentDeclinedException(failed.reason());
			}
		};
	}
}
