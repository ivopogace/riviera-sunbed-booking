package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.CancellationWindow;
import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.payment.api.CollectionGuarantee;
import ai.riviera.platform.payment.api.PaymentCredentialsLookup;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The view use case's <strong>withheld-confirmation-mail</strong> contract: a confirmed
 * booking reports whether its confirmation mail was suppressed, so the post-payment surface can tell
 * the guest to save their code.
 *
 * <p>The negative case is the security-relevant one. Answering "is this address suppressed?" for a
 * booking that is not yet confirmed would turn the code-gated view into an oracle for any address
 * someone can start a checkout with — the `202` create hands out the code <em>before</em> payment.
 * So the port must not merely return {@code false} before confirmation; it must not be
 * <em>consulted</em>, which is what {@link #neverConsultsMailDeliveryBeforeConfirmation} pins.
 */
class ViewBookingServiceTest {

	private static final String CODE = "ABCD2345";
	private static final CustomerId GUEST = new CustomerId(7);
	private static final SetId SET = new SetId(2);
	private static final VenueId VENUE = new VenueId(1);
	private static final LocalDate DATE = LocalDate.of(2026, 8, 1);

	private final Bookings bookings = mock(Bookings.class);
	private final CancellationPolicy cancellationPolicy = mock(CancellationPolicy.class);
	private final PaymentCredentialsLookup checkout = mock(PaymentCredentialsLookup.class);
	private final ConfirmationMailDelivery mailDelivery = mock(ConfirmationMailDelivery.class);
	private final CollectionGuarantee collection = mock(CollectionGuarantee.class);

	private final ViewBookingService service =
			new ViewBookingService(bookings, cancellationPolicy, checkout, mailDelivery, collection);

	@Test
	void flagsWithheldConfirmationMailForSuppressedGuest() {
		givenBooking(BookingStatus.CONFIRMED);
		when(mailDelivery.isWithheld(GUEST)).thenReturn(true);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.emailWithheld()).isTrue();
	}

	@Test
	void doesNotFlagWithheldMailForDeliverableGuest() {
		givenBooking(BookingStatus.CONFIRMED);
		when(mailDelivery.isWithheld(GUEST)).thenReturn(false);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.emailWithheld()).isFalse();
	}

	@Test
	void neverConsultsMailDeliveryBeforeConfirmation() {
		givenBooking(BookingStatus.AWAITING_PAYMENT);
		when(checkout.pendingCredentials(any())).thenReturn(Optional.empty());

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.emailWithheld()).isFalse();
		verifyNoInteractions(mailDelivery);
	}

	@Test
	void neverConsultsMailDeliveryForAPendingRequest() {
		givenBooking(BookingStatus.PENDING_REQUEST);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.emailWithheld()).isFalse();
		verifyNoInteractions(mailDelivery);
	}

	@Test
	void neverConsultsMailDeliveryWhenConfirmationDoesNotProveCollection() {
		// The stub gateway reaches CONFIRMED having taken no money, so "post-payment" is not true
		// there and the flag would be a free suppression oracle for any address.
		givenBooking(BookingStatus.CONFIRMED);
		when(collection.provenBeforeConfirmation()).thenReturn(false);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.emailWithheld()).isFalse();
		verifyNoInteractions(mailDelivery);
	}

	/**
	 * The two flags are separate predicates over disjoint states, and the view must never conflate
	 * them: a pending request has collected nothing, so the cancellation policy has no say in whether
	 * it can be retracted. The service carries a standing comment warning against exactly the
	 * widening these two cases forbid.
	 */
	@Test
	void pendingRequestIsWithdrawableButNotCancellable() {
		givenBooking(BookingStatus.PENDING_REQUEST);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.withdrawable()).isTrue();
		assertThat(detail.cancellable()).isFalse();
	}

	@Test
	void confirmedIsCancellableButNotWithdrawable() {
		givenBooking(BookingStatus.CONFIRMED);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.withdrawable()).isFalse();
		assertThat(detail.cancellable()).isTrue();
	}

	@Test
	void anAlreadyWithdrawnRequestIsNoLongerWithdrawable() {
		givenBooking(BookingStatus.WITHDRAWN);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.withdrawable()).isFalse();
		assertThat(detail.cancellable()).isFalse();
	}

	/**
	 * The refund figure is deliberately NOT asserted here: this service copies {@code refundMinor}
	 * straight off the quote, so a stubbed 0 would only pin the stub. {@code RefundPolicyTest} owns
	 * the closed-window amount, and {@code BookingViewIT} pins the two together end to end.
	 */
	@Test
	void pastBookingIsNotCancellableEvenThoughItIsConfirmed() {
		givenBooking(BookingStatus.CONFIRMED, CancellationWindow.CLOSED, 0L);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.cancellable()).isFalse();
		assertThat(detail.beforeCutoff()).isFalse();
	}

	/**
	 * The pay fence is a short-circuit, not a filter on the answer — the same shape as the D-8 mail
	 * gate above it. Past the service day's opening the credentials port must not be
	 * <em>consulted</em>: a {@code clientSecret} handed out then buys a stay already underway
	 * (invariant #4), which #566's cancellation fence would immediately refuse to undo.
	 */
	@Test
	void withholdsPaymentCredentialsOnceTheServiceDayHasOpened() {
		givenBooking(BookingStatus.AWAITING_PAYMENT, CancellationWindow.CLOSED, 0L);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNull();
		assertThat(detail.payWindowClosed()).isTrue();
		verifyNoInteractions(checkout);
	}

	@Test
	void stillIssuesCredentialsBeforeTheServiceDayOpens() {
		givenBooking(BookingStatus.AWAITING_PAYMENT);
		when(checkout.pendingCredentials(any()))
				.thenReturn(Optional.of(new PaymentCredentials("cs_x", "pi_x")));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNotNull();
		assertThat(detail.payWindowClosed()).isFalse();
	}

	/**
	 * The pay fence hangs off the service-day boundary, not the evening-before cutoff: between the
	 * two — the {@code LATE} window — the guest may still pay. Reading the fence off the quote is
	 * what makes that automatic; a second clock read could disagree with the very same response's
	 * {@code cancellable}.
	 */
	@Test
	void stillIssuesCredentialsAfterTheCutoffWhileTheServiceDayIsStillClosed() {
		givenBooking(BookingStatus.AWAITING_PAYMENT, CancellationWindow.LATE, 2250L);
		when(checkout.pendingCredentials(any()))
				.thenReturn(Optional.of(new PaymentCredentials("cs_x", "pi_x")));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNotNull();
		assertThat(detail.payWindowClosed()).isFalse();
	}

	/**
	 * The flag answers a question only an unpaid booking has, so it stays {@code false} on a
	 * delivered stay — where "no payment may be taken any more" would be a nonsense reading.
	 */
	@Test
	void neverReportsAClosedPayWindowForABookingThatIsNotAwaitingPayment() {
		givenBooking(BookingStatus.CONFIRMED, CancellationWindow.CLOSED, 0L);

		assertThat(service.byCode(CODE).orElseThrow().payWindowClosed()).isFalse();
	}

	/**
	 * The reason separates the two cancellations that carry a refund: a venue's weather refund is one
	 * the guest never asked for, and {@code refundedAmount} alone cannot tell it from their own
	 * cancellation. Carried verbatim off the row — this service classifies nothing.
	 */
	@Test
	void carriesTheCancellationReason() {
		givenCancelledBooking(RefundReason.WEATHER, 4500L);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.cancelReason()).isEqualTo(RefundReason.WEATHER);
		assertThat(detail.refundedAmount()).isEqualTo(new MoneyView(4500L, "EUR"));
	}

	/**
	 * The abandoned-payment sweep and the {@code payment_intent.canceled} webhook both flip the status
	 * without stamping a reason, because no refund decision was ever taken. A null reason beside a null
	 * refund is what tells the guest they were never charged.
	 */
	@Test
	void reportsNoReasonForANeverChargedCancellation() {
		givenCancelledBooking(null, null);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.cancelReason()).isNull();
		assertThat(detail.refundedAmount()).isNull();
	}

	private void givenBooking(BookingStatus status) {
		givenBooking(status, CancellationWindow.FREE, 4500L);
	}

	private void givenCancelledBooking(RefundReason reason, Long refundMinor) {
		when(collection.provenBeforeConfirmation()).thenReturn(true);
		BookingRecord record = new BookingRecord(1L, CODE, BookingStatus.CANCELLED, VENUE, SET, GUEST,
				DATE, 4500L, "EUR", Instant.EPOCH, refundMinor, null, reason);
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(record));
		when(cancellationPolicy.quote(record))
				.thenReturn(new CancellationPolicy.RefundQuote(setInfo(), CancellationWindow.CLOSED, 0L));
	}

	private void givenBooking(BookingStatus status, CancellationWindow window, long refundMinor) {
		when(collection.provenBeforeConfirmation()).thenReturn(true);
		BookingRecord record = new BookingRecord(1L, CODE, status, VENUE, SET, GUEST, DATE,
				4500L, "EUR", null, null, null, null);
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(record));
		when(cancellationPolicy.quote(record))
				.thenReturn(new CancellationPolicy.RefundQuote(setInfo(), window, refundMinor));
	}

	private static SetBookingInfo setInfo() {
		return new SetBookingInfo(SET, VENUE, "Miramar", "Front row", 2, "ONLINE",
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0), BookingMode.INSTANT);
	}
}
