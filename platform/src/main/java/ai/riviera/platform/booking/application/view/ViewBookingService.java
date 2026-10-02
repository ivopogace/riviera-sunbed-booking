package ai.riviera.platform.booking.application.view;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.application.cancel.LiveRemainder;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.application.request.RequestWindows;
import ai.riviera.platform.booking.vocabulary.BookingId;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.StayStatus;
import ai.riviera.platform.booking.domain.BookingTransition;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The view-a-booking use case: load the booking by code and assemble its display + the
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
	private final RemodelReceipts receipts;
	private final LiveRemainder liveRemainder;
	private final Clock clock;

	ViewBookingService(Bookings bookings, CancellationPolicy cancellationPolicy, BookingCutoff cutoff,
			ai.riviera.platform.payment.api.PaymentCredentialsLookup checkout,
			ai.riviera.platform.booking.spi.ConfirmationMailDelivery confirmationMail,
			ai.riviera.platform.payment.api.CollectionGuarantee collection,
			ai.riviera.platform.payment.api.RefundStatusLookup refundStatus,
			ai.riviera.platform.review.api.ReviewEligibility reviewEligibility,
			CustomerLookup customers, RequestWindows windows, RemodelReceipts receipts, LiveRemainder liveRemainder,
			Clock clock) {
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
		this.receipts = receipts;
		this.liveRemainder = liveRemainder;
		this.clock = clock;
	}

	@Override
	public Optional<BookingDetail> byCode(String code) {
		Optional<BookingDetail> booking = bookings.findByCode(code).map(this::toDetail);
		return booking.isPresent() ? booking : bookings.findStayByCode(code).map(this::toStayDetail);
	}

	/**
	 * A stay reads as one booking (ADR-0024): code, span, {@link StayStatus}, the first stretch's spot and credentials
	 * (one intent), money summed, every stretch quoted on the day the cancel judges the {@link LiveRemainder} on, each
	 * with its own move (the stay's is null: its spot is the first stretch's); cancellable and refund are the remainder's (#10).
	 */
	private BookingDetail toStayDetail(StayRecord stay) {
		List<BookingRecord> stretches = stay.stretches();
		BookingRecord first = stretches.getFirst();
		BookingRecord summary = stay.asBooking();
		BookingStatus status = summary.status();
		LiveRemainder.Split remainder = liveRemainder.of(stay);
		List<RefundQuote> quotes = stretches.stream().map(s -> cancellationPolicy.quote(s, remainder.windowDay())).toList();
		SetBookingInfo firstSet = quotes.getFirst().set();
		List<RefundQuote> liveQuotes = remainder.live().stream().map(s -> quotes.get(stretches.indexOf(s))).toList();
		boolean cancellable = !remainder.live().isEmpty()
				&& remainder.live().stream().allMatch(s -> BookingTransition.CANCEL_BY_GUEST.admits(s.status()))
				&& liveQuotes.stream().allMatch(RefundQuote::cancellationOpen);
		long refundIfCancelledNow = liveQuotes.stream().mapToLong(RefundQuote::refundMinor).reduce(0L, Math::addExact);
		boolean refundOutstanding = stretches.stream().anyMatch(s -> s.status() == BookingStatus.CANCELLED
				&& s.refundMinor() != null && s.refundMinor() > 0
				&& refundStatus.progressOf(new ai.riviera.platform.payment.vocabulary.BookingRef(s.id()))
						== ai.riviera.platform.payment.vocabulary.RefundProgress.OUTSTANDING);
		boolean awaitingPayment = status == BookingStatus.AWAITING_PAYMENT;
		boolean payWindowClosed = awaitingPayment && windows.payWindowClosed(first.acceptedAt(),
				cutoff.serviceDayEndsAt(first.bookingDate()), clock.instant());
		ai.riviera.platform.payment.vocabulary.PaymentCredentials payment = awaitingPayment && !payWindowClosed
				? checkout.pendingCredentials(new ai.riviera.platform.payment.vocabulary.BookingRef(first.id())).orElse(null)
				: null;
		boolean emailWithheld = status == BookingStatus.CONFIRMED && collection.provenBeforeConfirmation()
				&& confirmationMail.isWithheld(first.customerId());
		ReviewPanel panel = reviewEligibility.panelFor(stay.code());
		List<BookingDetail.StayStretch> stretchViews = new ArrayList<>();
		for (int i = 0; i < stretches.size(); i++) {
			BookingRecord stretch = stretches.get(i);
			SetBookingInfo set = quotes.get(i).set();
			stretchViews.add(new BookingDetail.StayStretch(stretch.setId(), set.rowLabel(), set.positionNo(),
					stretch.bookingDate(), stretch.lastDate(), new MoneyView(stretch.amountMinor(), stretch.currency()),
					stretch.status(), moveOf(stretch, quotes.get(i))));
		}
		return new BookingDetail(stay.code(), status, stay.venueId(), firstSet.venueName(), firstSet.rowLabel(),
				firstSet.positionNo(), stay.firstDay(), stay.lastDay(), new MoneyView(summary.amountMinor(), first.currency()),
				cancellable, status == BookingStatus.PENDING_REQUEST,
				liveQuotes.isEmpty() ? quotes.getFirst().beforeCutoff() : liveQuotes.getFirst().beforeCutoff(),
				new MoneyView(refundIfCancelledNow, first.currency()),
				summary.refundMinor() == null ? null : new MoneyView(summary.refundMinor(), first.currency()),
				refundOutstanding, summary.requestExpiresAt(), payment, emailWithheld, payWindowClosed,
				summary.cancelReason(), summary.declineReason(),
				cutoff.cancellationWindow(firstSet.bookingCutoff(), stay.firstDay(), first.createdAt()),
				panel, nameSuggestionFor(panel, first), null, stretchViews,
				stretches.stream().flatMap(s -> bookings.findRefundedDays(s.id()).stream()).toList());
	}

	/**
	 * Gates {@code emailWithheld}: the port must not even be asked until money was provably collected
	 * ({@code CONFIRMED} under a collecting gateway), or this code-gated view is a suppression oracle.
	 * Its own predicate, not {@code cancellable}'s. Rationale: {@code RESPONSIBILITIES.md} §booking.
	 */
	private boolean mayDiscloseMailStatus(BookingRecord b) {
		return b.status() == BookingStatus.CONFIRMED && collection.provenBeforeConfirmation();
	}

	private BookingDetail toDetail(BookingRecord b) {
		ReviewPanel panel = reviewEligibility.panelFor(b.code());
		RefundQuote quote = cancellationPolicy.quote(b);
		SetBookingInfo set = quote.set();
		boolean cancellable = BookingTransition.CANCEL_BY_GUEST.admits(b.status()) && quote.cancellationOpen();
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
				set.positionNo(), b.bookingDate(), b.lastDate(), new MoneyView(b.amountMinor(), b.currency()),
				cancellable, withdrawable, quote.beforeCutoff(),
				new MoneyView(quote.refundMinor(), b.currency()),
				refunded, refundOutstanding, b.requestExpiresAt(), payment, emailWithheld,
				payWindowClosed, b.cancelReason(), b.declineReason(),
				cutoff.cancellationWindow(set.bookingCutoff(), b.bookingDate(), b.createdAt()),
				panel, nameSuggestionFor(panel, b), moveOf(b, quote), List.of(),
				b.dayRefundedMinor() == 0 ? List.of() : bookings.findRefundedDays(b.id()));
	}

	/** The latest move of a moved booking, with the exit deadline the quote still holds open; {@code null} otherwise. */
	private BookingMove moveOf(BookingRecord b, RefundQuote quote) {
		if (b.movedAt() == null) {
			return null;
		}
		return receipts.latestMoveOf(new BookingId(b.id()))
				.map(move -> new BookingMove(move.from().rowLabel(), move.from().positionNo(), move.rowsAway(),
						move.positionsAway(), b.movedAt(), quote.freeExitUntil()))
				.orElse(null);
	}

	/**
	 * The review form's prefilled display name: the first token of the contact's name, the only "first
	 * name" stored. {@code null} for any other panel, or once the contact is erased (ADR-0010).
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
