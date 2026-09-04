package ai.riviera.platform.booking.application.view;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.application.request.RequestWindows;

import java.time.Clock;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The view-a-booking use case (U6): load the booking by code and assemble its display + the
 * server-computed cancellation terms (invariant #10). The refund-if-cancelled-now is computed by the
 * shared {@link CancellationPolicy} — the same rule the cancel use case applies, so the displayed and
 * actioned refunds can never diverge. Package-private behind the {@link ViewBooking} port (invariant
 * #11); read-only, so no {@code @Transactional}.
 */
@Service
class ViewBookingService implements ViewBooking {

	private final Bookings bookings;
	private final CancellationPolicy cancellationPolicy;
	private final BookingCutoff cutoff;
	private final ai.riviera.platform.payment.api.PaymentCredentialsLookup checkout;
	private final ai.riviera.platform.booking.spi.ConfirmationMailDelivery confirmationMail;
	private final ai.riviera.platform.payment.api.CollectionGuarantee collection;
	private final ai.riviera.platform.payment.api.RefundStatusLookup refundStatus;
	private final ai.riviera.platform.review.api.ReviewEligibility reviewEligibility;
	private final CustomerLookup customers;
	private final RequestWindows windows;
	private final Clock clock;

	ViewBookingService(Bookings bookings, CancellationPolicy cancellationPolicy, BookingCutoff cutoff,
			ai.riviera.platform.payment.api.PaymentCredentialsLookup checkout,
			ai.riviera.platform.booking.spi.ConfirmationMailDelivery confirmationMail,
			ai.riviera.platform.payment.api.CollectionGuarantee collection,
			ai.riviera.platform.payment.api.RefundStatusLookup refundStatus,
			ai.riviera.platform.review.api.ReviewEligibility reviewEligibility,
			CustomerLookup customers, RequestWindows windows, Clock clock) {
		this.bookings = bookings;
		this.cancellationPolicy = cancellationPolicy;
		this.cutoff = cutoff;
		this.checkout = checkout;
		this.confirmationMail = confirmationMail;
		this.collection = collection;
		this.refundStatus = refundStatus;
		this.reviewEligibility = reviewEligibility;
		this.customers = customers;
		this.windows = windows;
		this.clock = clock;
	}

	@Override
	public Optional<BookingDetail> byCode(String code) {
		return bookings.findByCode(code).map(this::toDetail);
	}

	/**
	 * The D-8 gate on {@code emailWithheld}: a short-circuit, not a filter on the answer — the
	 * port must not be <em>consulted</em> before the booking is settled, because the {@code 202} create
	 * hands the code out before the card is collected, and answering then would turn this code-gated
	 * view into a suppression oracle for any address a checkout can be started with.
	 *
	 * <p>Deliberately its own predicate rather than reusing {@code cancellable}, which no longer tests
	 * the same thing at all — {@code cancellable} now also requires the cancellation window to be open,
	 * so a delivered booking is uncancellable while its mail status stays disclosable. Pinned by
	 * {@code ViewBookingServiceTest}'s no-interaction cases.
	 *
	 * <p><strong>Status alone is not enough</strong>, which the review gate caught: it means
	 * "post-payment" only where the wired gateway actually collects before confirming. Under the
	 * in-process stub {@code CONFIRMED} is reached having taken no money, so the flag would be free to
	 * probe; {@code payment.api.CollectionGuarantee} is asked rather than a profile string, so the gate
	 * is a checkable property of the payment model and survives a third gateway.
	 */
	private boolean mayDiscloseMailStatus(BookingRecord b) {
		return b.status() == BookingStatus.CONFIRMED && collection.provenBeforeConfirmation();
	}

	private BookingDetail toDetail(BookingRecord b) {
		ReviewPanel panel = reviewEligibility.panelFor(b.code());
		RefundQuote quote = cancellationPolicy.quote(b);
		SetBookingInfo set = quote.set();
		boolean cancellable = b.status() == BookingStatus.CONFIRMED && quote.cancellationOpen();
		// Its own predicate, not a reuse of cancellable's: see BookingDetail.
		boolean withdrawable = b.status() == BookingStatus.PENDING_REQUEST;
		boolean emailWithheld = mayDiscloseMailStatus(b) && confirmationMail.isWithheld(b.customerId());

		MoneyView refunded = b.refundMinor() == null ? null
				: new MoneyView(b.refundMinor(), b.currency());
		// Lazy like the credentials read: only a cancelled booking with money owed has a refund to track.
		boolean refundOutstanding = b.status() == BookingStatus.CANCELLED
				&& b.refundMinor() != null && b.refundMinor() > 0
				&& refundStatus.progressOf(new ai.riviera.platform.payment.vocabulary.BookingRef(b.id()))
						== ai.riviera.platform.payment.vocabulary.RefundProgress.OUTSTANDING;
		boolean awaitingPayment = b.status() == BookingStatus.AWAITING_PAYMENT;
		boolean payWindowClosed = awaitingPayment && windows.payWindowClosed(b.acceptedAt(),
				cutoff.serviceDayEndsAt(b.bookingDate()), clock.instant());
		ai.riviera.platform.payment.vocabulary.PaymentCredentials payment =
				awaitingPayment && !payWindowClosed
						? checkout.pendingCredentials(
								new ai.riviera.platform.payment.vocabulary.BookingRef(b.id())).orElse(null)
						: null;
		return new BookingDetail(b.code(), b.status(), b.venueId(), set.venueName(), set.rowLabel(),
				set.positionNo(), b.bookingDate(), new MoneyView(b.amountMinor(), b.currency()),
				cancellable, withdrawable, quote.beforeCutoff(),
				new MoneyView(quote.refundMinor(), b.currency()),
				refunded, refundOutstanding, b.requestExpiresAt(), payment, emailWithheld,
				payWindowClosed, b.cancelReason(),
				cutoff.cancellationWindow(set.bookingCutoff(), b.bookingDate(), b.createdAt()),
				panel, nameSuggestionFor(panel, b));
	}

	/**
	 * The display name to prefill the review form with: the first whitespace-separated token of the
	 * contact's name, which is the only "first name" this system stores. {@code null} for any panel
	 * but the form, and whenever the contact is gone (erasure, ADR-0010) — the form then simply
	 * starts empty.
	 */
	private String nameSuggestionFor(ReviewPanel panel, BookingRecord b) {
		if (!(panel instanceof ReviewPanel.Eligible)) {
			return null;
		}
		return customers.findById(b.customerId())
				.map(GuestContact::fullName)
				.map(String::strip)
				.filter(name -> !name.isEmpty())
				.map(name -> name.split("\\s+", 2)[0])
				.orElse(null);
	}
}
