package ai.riviera.platform.booking.application.reserve;

import java.time.Clock;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Optional;

import ai.riviera.platform.booking.application.ConfirmationMailDisclosure;
import ai.riviera.platform.booking.application.MailDisclosure;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.reserve.StayReserveOutcome.ReservedStretch;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * A stitched stay in two phases, as {@link CreateBookingService}: {@link ReserveStayService#reserve}
 * claims every stretch and commits the group; only then is {@link CheckoutPort#pay(List)} called
 * once, with one share per stretch under one PaymentIntent (design D8), outside any transaction.
 * {@code Pending} waits for the verified webhook, which confirms each stretch (invariant #8);
 * {@code Failed}, a throw, or a failed stub confirm releases every stretch before surfacing.
 */
@Service
class CreateStayService implements CreateStay {

	private static final Logger log = LoggerFactory.getLogger(CreateStayService.class);

	private final ReserveStayService reservation;
	private final CheckoutPort checkout;
	private final ConfirmBooking confirmBooking;
	private final ReleaseAbandonedBooking releaseAbandoned;
	private final ConfirmationMailDisclosure mailDisclosure;
	private final Clock clock;

	CreateStayService(ReserveStayService reservation, CheckoutPort checkout, ConfirmBooking confirmBooking,
			ReleaseAbandonedBooking releaseAbandoned, ConfirmationMailDisclosure mailDisclosure, Clock clock) {
		this.reservation = reservation;
		this.checkout = checkout;
		this.confirmBooking = confirmBooking;
		this.releaseAbandoned = releaseAbandoned;
		this.mailDisclosure = mailDisclosure;
		this.clock = clock;
	}

	@Override
	public StayOutcome create(CreateStayCommand command) {
		return switch (reservation.reserve(command)) {
			case StayReserveOutcome.Rejected rejected -> new StayOutcome.Rejected(rejected.reason());
			case StayReserveOutcome.Reserved reserved -> collect(reserved, Optional.ofNullable(command.accountId()));
			case StayReserveOutcome.Requested requested -> {
				log.info("stay request {} of {} stretches sent", requested.stayId().value(), requested.stretches().size());
				yield new StayOutcome.Requested(confirmation(requested.code(), requested.venue(), requested.stretches(),
						BookingStatus.PENDING_REQUEST, MailDisclosure.UNDISCLOSED), requested.requestExpiresAt());
			}
		};
	}

	private StayOutcome collect(StayReserveOutcome.Reserved reserved, Optional<CustomerAccountId> reader) {
		String currency = reserved.venue().price().currency();
		PaymentOutcome payment;
		try {
			payment = checkout.pay(reserved.stretches().stream()
					.map(stretch -> new CollectionShare(new BookingRef(stretch.bookingId()), new PayeeRef(stretch.set().venueId().value()),
							new Money(stretch.amountMinor(), currency)))
					.toList());
		}
		catch (RuntimeException paymentBlewUp) {
			releaseEveryStretch(reserved);
			throw paymentBlewUp;
		}
		return switch (payment) {
			case PaymentOutcome.Succeeded ignored -> {
				try {
					confirmBooking.confirmAll(reserved.stretches().stream().map(ReservedStretch::bookingId).toList(),
							clock.instant());
				}
				catch (RuntimeException confirmFailed) {
					releaseEveryStretch(reserved);
					throw confirmFailed;
				}
				log.info("confirmed stay {} of {} stretches", reserved.stayId().value(), reserved.stretches().size());
				MailDisclosure mail = mailDisclosure.disclose(BookingStatus.CONFIRMED,
						reserved.stretches().getFirst().bookingId(), reserved.customerId(), reader);
				yield new StayOutcome.Confirmed(confirmation(reserved, BookingStatus.CONFIRMED, mail));
			}
			case PaymentOutcome.Pending pending -> {
				log.info("awaiting payment for stay {} of {} stretches", reserved.stayId().value(),
						reserved.stretches().size());
				yield new StayOutcome.AwaitingPayment(confirmation(reserved, BookingStatus.AWAITING_PAYMENT, MailDisclosure.UNDISCLOSED),
						pending.instruction());
			}
			case PaymentOutcome.Failed failed -> {
				releaseEveryStretch(reserved);
				log.info("released stay {} after payment initiation failed", reserved.stayId().value());
				throw new PaymentDeclinedException(failed.reason());
			}
			case PaymentOutcome.MixedPayees ignored -> {
				releaseEveryStretch(reserved);
				log.warn("refused collection for stay {}: its stretches pay more than one venue", reserved.stayId().value());
				yield new StayOutcome.Rejected(BookingOutcome.Rejected.SPANS_VENUES);
			}
		};
	}

	private void releaseEveryStretch(StayReserveOutcome.Reserved reserved) {
		for (ReservedStretch stretch : reserved.stretches()) {
			releaseAbandoned.release(new BookingId(stretch.bookingId()));
		}
	}

	private static StayConfirmation confirmation(StayReserveOutcome.Reserved reserved, BookingStatus status,
			MailDisclosure mail) {
		return confirmation(reserved.code(), reserved.venue(), reserved.stretches(), status, mail);
	}

	private static StayConfirmation confirmation(String code, SetBookingInfo venue, List<ReservedStretch> reserved,
			BookingStatus status, MailDisclosure mail) {
		String currency = venue.price().currency();
		List<StayConfirmation.Stretch> stretches = reserved.stream()
				.map(stretch -> new StayConfirmation.Stretch(stretch.set().setId(), stretch.set().rowLabel(),
						stretch.set().positionNo(), stretch.firstDay(), stretch.lastDay(),
						new MoneyView(stretch.amountMinor(), currency)))
				.toList();
		long totalMinor = reserved.stream().mapToLong(ReservedStretch::amountMinor).reduce(0L, Math::addExact);
		return new StayConfirmation(code, status, venue.venueId(), venue.venueName(),
				new ai.riviera.platform.venue.vocabulary.StaySpan(stretches.getFirst().firstDay(),
						stretches.getLast().lastDay()),
				new MoneyView(totalMinor, currency), stretches, mail);
	}
}
