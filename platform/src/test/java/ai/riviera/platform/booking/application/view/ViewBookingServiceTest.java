package ai.riviera.platform.booking.application.view;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.application.request.RequestWindows;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.payment.api.CollectionGuarantee;
import ai.riviera.platform.payment.api.PaymentCredentialsLookup;
import ai.riviera.platform.payment.api.RefundStatusLookup;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import ai.riviera.platform.payment.vocabulary.RefundProgress;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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

	/** 11:00 Tirane on {@code DATE} (CEST): the service day is open and ends at 22:00Z. */
	private static final Clock NOW = Clock.fixed(Instant.parse("2026-08-01T09:00:00Z"), ZoneId.of("UTC"));
	private static final RequestWindows WINDOWS =
			new RequestWindows(java.time.Duration.ofHours(24), java.time.Duration.ofHours(12));

	private final Bookings bookings = mock(Bookings.class);
	private final CancellationPolicy cancellationPolicy = mock(CancellationPolicy.class);
	private final BookingCutoff cutoff = new BookingCutoff(NOW);
	private final PaymentCredentialsLookup checkout = mock(PaymentCredentialsLookup.class);
	private final ConfirmationMailDelivery mailDelivery = mock(ConfirmationMailDelivery.class);
	private final CollectionGuarantee collection = mock(CollectionGuarantee.class);
	private final RefundStatusLookup refundStatus = mock(RefundStatusLookup.class);

	private final ai.riviera.platform.review.api.ReviewEligibility reviewEligibility =
			mock(ai.riviera.platform.review.api.ReviewEligibility.class);
	private final ai.riviera.platform.customer.api.CustomerLookup customers =
			mock(ai.riviera.platform.customer.api.CustomerLookup.class);

	private final ViewBookingService service = new ViewBookingService(bookings, cancellationPolicy,
			cutoff, checkout, mailDelivery, collection, refundStatus, reviewEligibility, customers,
			WINDOWS, NOW);

	@org.junit.jupiter.params.ParameterizedTest
	@org.junit.jupiter.params.provider.MethodSource("everyPanel")
	void reviewPanelFollowsReviewEligibility(ReviewPanel panel) {
		// COMPLETED throughout: the panel tracks review's verdict, not the status it sits beside.
		givenBooking(BookingStatus.COMPLETED);
		when(reviewEligibility.panelFor(CODE)).thenReturn(panel);

		assertThat(service.byCode(CODE).orElseThrow().reviewPanel()).isEqualTo(panel);
	}

	static java.util.stream.Stream<ReviewPanel> everyPanel() {
		Instant closes = Instant.parse("2026-09-01T09:00:00Z");
		OwnReview own = new OwnReview(4, "Great sunbeds", "Ana");
		return java.util.stream.Stream.of(new ReviewPanel.Eligible(closes),
				new ReviewPanel.AlreadyReviewed(own, closes), new ReviewPanel.Frozen(own),
				new ReviewPanel.WindowClosed(), new ReviewPanel.NotCompleted());
	}

	@Test
	void suggestsTheContactFirstNameForTheReviewForm() {
		givenBooking(BookingStatus.COMPLETED);
		givenReviewable();
		when(customers.findById(GUEST))
				.thenReturn(Optional.of(new GuestContact("ana@example.test", "Ana Kelmendi", "+355690000000")));

		assertThat(service.byCode(CODE).orElseThrow().reviewNameSuggestion()).isEqualTo("Ana");
	}

	@Test
	void suggestsNoNameWhenTheContactIsGone() {
		givenBooking(BookingStatus.COMPLETED);
		givenReviewable();
		when(customers.findById(GUEST)).thenReturn(Optional.empty());

		assertThat(service.byCode(CODE).orElseThrow().reviewNameSuggestion()).isNull();
	}

	@Test
	void neverSuggestsANameForAPanelThatCarriesNoForm() {
		givenBooking(BookingStatus.COMPLETED);
		when(reviewEligibility.panelFor(CODE)).thenReturn(new ReviewPanel.WindowClosed());

		assertThat(service.byCode(CODE).orElseThrow().reviewNameSuggestion()).isNull();
		verify(customers, never()).findById(any());
	}

	private void givenReviewable() {
		when(reviewEligibility.panelFor(CODE))
				.thenReturn(new ReviewPanel.Eligible(Instant.parse("2026-09-01T09:00:00Z")));
	}

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
	 * gate above it. Past the pay deadline — {@code min(accepted_at + pay-window, end of service
	 * day)}, the same instant the payment-due mail promises — the credentials port must not be
	 * <em>consulted</em> (invariant #4).
	 */
	@Test
	void withholdsCredentialsOnceTheServiceDayHasEnded() {
		// Never accepted, so the deadline is its day's end — two days gone by now.
		givenAwaitingPayment(LocalDate.of(2026, 7, 30), Instant.EPOCH, null);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNull();
		assertThat(detail.payWindowClosed()).isTrue();
		verifyNoInteractions(checkout);
	}

	@Test
	void issuesCredentialsUntilThePayDeadline() {
		// Accepted 10:00 Tirane on D itself: the deadline is 22:00, eleven hours away (#792).
		givenAwaitingPayment(DATE, Instant.EPOCH, Instant.parse("2026-08-01T08:00:00Z"));
		when(checkout.pendingCredentials(any()))
				.thenReturn(Optional.of(new PaymentCredentials("cs_x", "pi_x")));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNotNull();
		assertThat(detail.payWindowClosed()).isFalse();
	}

	@Test
	void withholdsCredentialsOncePayDeadlinePassed() {
		// Accepted 20:00 Tirane the evening before: the 12h window ran out at 08:00, an hour ago.
		givenAwaitingPayment(DATE, Instant.EPOCH, Instant.parse("2026-07-31T18:00:00Z"));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNull();
		assertThat(detail.payWindowClosed()).isTrue();
		verifyNoInteractions(checkout);
	}

	@Test
	void stillIssuesCredentialsAtTheExactDeadlineInstant() {
		// The mailed deadline itself is still payable (mail ≡ sweep identity); closed strictly after.
		givenAwaitingPayment(DATE, Instant.EPOCH, Instant.parse("2026-07-31T21:00:00Z"));
		when(checkout.pendingCredentials(any()))
				.thenReturn(Optional.of(new PaymentCredentials("cs_x", "pi_x")));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNotNull();
		assertThat(detail.payWindowClosed()).isFalse();
	}

	@Test
	void acceptedAdvanceBookingKeepsCredentialsIntoItsServiceDay() {
		// Accepted 23:30 the evening before, window to 11:30: the old day-open withhold is wrong now.
		givenAwaitingPayment(DATE, Instant.EPOCH, Instant.parse("2026-07-31T21:30:00Z"));
		when(checkout.pendingCredentials(any()))
				.thenReturn(Optional.of(new PaymentCredentials("cs_x", "pi_x")));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNotNull();
		assertThat(detail.payWindowClosed()).isFalse();
	}

	@Test
	void neverAcceptedBookingKeepsCredentialsUntilDayEnd() {
		// Advance-born, never accepted, day underway: the TTL stays a sweep-only backstop.
		givenAwaitingPayment(DATE, Instant.EPOCH, null);
		when(checkout.pendingCredentials(any()))
				.thenReturn(Optional.of(new PaymentCredentials("cs_x", "pi_x")));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNotNull();
		assertThat(detail.payWindowClosed()).isFalse();
	}

	@Test
	void withholdsCredentialsAtTheExactEndOfServiceDay() {
		// Day-end bound is inclusive, exactly as the sweep's day arm reaps at that instant (review F-2).
		givenAwaitingPayment(DATE, Instant.EPOCH, null);
		ViewBookingService atDayEnd = serviceAt(Instant.parse("2026-08-01T22:00:00Z"));

		BookingDetail detail = atDayEnd.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNull();
		assertThat(detail.payWindowClosed()).isTrue();
		verifyNoInteractions(checkout);
	}

	@Test
	void dayEndCapClosesAnAcceptedBookingAtThatSameInstant() {
		// Accepted mid-day, raw window crossing midnight: the capped deadline shares the day arm's edge.
		givenAwaitingPayment(DATE, Instant.EPOCH, Instant.parse("2026-08-01T12:00:00Z"));
		ViewBookingService atDayEnd = serviceAt(Instant.parse("2026-08-01T22:00:00Z"));

		BookingDetail detail = atDayEnd.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNull();
		assertThat(detail.payWindowClosed()).isTrue();
		verifyNoInteractions(checkout);
	}

	@Test
	void sameDayBornBookingKeepsItsCredentials() {
		// Same-day-born, never accepted: same day-end deadline as any other unaccepted row.
		Instant sameDayBirth = Instant.parse("2026-08-01T10:00:00Z");
		givenBooking(BookingStatus.AWAITING_PAYMENT, CancellationWindow.CLOSED, 0L, sameDayBirth);
		when(checkout.pendingCredentials(any()))
				.thenReturn(Optional.of(new PaymentCredentials("cs_x", "pi_x")));

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.payment()).isNotNull();
		assertThat(detail.payWindowClosed()).isFalse();
	}

	/**
	 * The pay fence hangs off the pay deadline, not the evening-before cutoff: in the {@code LATE}
	 * cancellation window the guest may still pay — the two boundaries answer different questions
	 * and must not be conflated.
	 */
	@Test
	void stillIssuesCredentialsAfterTheCutoffWhileThePayDeadlineHolds() {
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

	/**
	 * The disclosure is about the guest's money, so it must track the gateway, not the decision:
	 * {@code OUTSTANDING} — collected but no refund accepted yet (the stuck-outbox case) — is
	 * the one state where the panel must stop claiming the money is on its way.
	 */
	@Test
	void flagsAStuckRefundAsOutstanding() {
		givenCancelledBooking(RefundReason.POLICY, 4500L);
		when(refundStatus.progressOf(any())).thenReturn(RefundProgress.OUTSTANDING);

		assertThat(service.byCode(CODE).orElseThrow().refundOutstanding()).isTrue();
	}

	@Test
	void doesNotFlagAnAcceptedRefundAsOutstanding() {
		givenCancelledBooking(RefundReason.POLICY, 4500L);
		when(refundStatus.progressOf(any())).thenReturn(RefundProgress.ACCEPTED);

		assertThat(service.byCode(CODE).orElseThrow().refundOutstanding()).isFalse();
	}

	/**
	 * Absence of a payment row means the wired gateway never collected (the stub profile), never that
	 * the refund failed. The copy must stay exactly as today.
	 */
	@Test
	void doesNotFlagARefundWhenNothingWasCollected() {
		givenCancelledBooking(RefundReason.POLICY, 4500L);
		when(refundStatus.progressOf(any())).thenReturn(RefundProgress.NO_COLLECTION);

		assertThat(service.byCode(CODE).orElseThrow().refundOutstanding()).isFalse();
	}

	/**
	 * The lazy-consult shape of the other payment reads: no refund decision (or no cancellation)
	 * means there is nothing to track, so the port is not asked at all.
	 */
	@Test
	void neverConsultsRefundStatusWithoutARefundDecision() {
		givenCancelledBooking(null, null);
		assertThat(service.byCode(CODE).orElseThrow().refundOutstanding()).isFalse();

		givenCancelledBooking(RefundReason.POLICY, 0L);
		assertThat(service.byCode(CODE).orElseThrow().refundOutstanding()).isFalse();

		givenBooking(BookingStatus.CONFIRMED);
		assertThat(service.byCode(CODE).orElseThrow().refundOutstanding()).isFalse();

		verifyNoInteractions(refundStatus);
	}

	/** #795 AC-8: a same-day booking reports its CLOSED birth window beside {@code cancellable=false}. */
	@Test
	void sameDayBookingReportsClosedBirthWindow() {
		Instant sameDayBirth = Instant.parse("2026-08-01T05:00:00Z");
		givenBooking(BookingStatus.CONFIRMED, CancellationWindow.CLOSED, 0L, sameDayBirth);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.cancellable()).isFalse();
		assertThat(detail.cancellationWindowAtBirth()).isEqualTo(CancellationWindow.CLOSED);
	}

	/** #795 AC-8 sibling: an advance FREE-born booking keeps every existing field unchanged. */
	@Test
	void advanceBookingReportsFreeBirthWindow() {
		givenBooking(BookingStatus.CONFIRMED, CancellationWindow.FREE, 4500L);

		BookingDetail detail = service.byCode(CODE).orElseThrow();

		assertThat(detail.cancellationWindowAtBirth()).isEqualTo(CancellationWindow.FREE);
		assertThat(detail.beforeCutoff()).isTrue();
		assertThat(detail.cancellable()).isTrue();
		assertThat(detail.refundIfCancelledNow().minorUnits()).isEqualTo(4500L);
	}

	private void givenBooking(BookingStatus status) {
		givenBooking(status, CancellationWindow.FREE, 4500L, Instant.EPOCH);
	}

	/** An {@code AWAITING_PAYMENT} row for the pay-fence cases; {@code acceptedAt} may be null. */
	/** The same collaborators on a different instant — for pinning the exact deadline boundaries. */
	private ViewBookingService serviceAt(Instant now) {
		Clock at = Clock.fixed(now, ZoneId.of("UTC"));
		return new ViewBookingService(bookings, cancellationPolicy, new BookingCutoff(at), checkout,
				mailDelivery, collection, refundStatus, reviewEligibility, customers, WINDOWS, at);
	}

	private void givenAwaitingPayment(LocalDate date, Instant createdAt, Instant acceptedAt) {
		when(collection.provenBeforeConfirmation()).thenReturn(true);
		BookingRecord record = new BookingRecord(1L, CODE, BookingStatus.AWAITING_PAYMENT, VENUE, SET,
				GUEST, date, 4500L, "EUR", null, null, null, null, createdAt, acceptedAt);
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(record));
		when(cancellationPolicy.quote(record))
				.thenReturn(new CancellationPolicy.RefundQuote(setInfo(), CancellationWindow.CLOSED, 0L));
	}

	/** A cancelled row: the refund decision's three fields move together, or none of them is set. */
	private void givenCancelledBooking(RefundReason reason, Long refundMinor) {
		BookingRecord record = new BookingRecord(1L, CODE, BookingStatus.CANCELLED, VENUE, SET, GUEST,
				DATE, 4500L, "EUR", refundMinor == null ? null : Instant.EPOCH, refundMinor, null, reason,
				Instant.EPOCH, null);
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(record));
		when(cancellationPolicy.quote(record))
				.thenReturn(new CancellationPolicy.RefundQuote(setInfo(), CancellationWindow.CLOSED, 0L));
	}

	private void givenBooking(BookingStatus status, CancellationWindow window, long refundMinor) {
		givenBooking(status, window, refundMinor, Instant.EPOCH);
	}

	/** {@code createdAt} is advance-born ({@code Instant.EPOCH}) by default; AC-7 tests override it. */
	private void givenBooking(BookingStatus status, CancellationWindow window, long refundMinor,
			Instant createdAt) {
		when(collection.provenBeforeConfirmation()).thenReturn(true);
		BookingRecord record = new BookingRecord(1L, CODE, status, VENUE, SET, GUEST, DATE,
				4500L, "EUR", null, null, null, null, createdAt, null);
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(record));
		when(cancellationPolicy.quote(record))
				.thenReturn(new CancellationPolicy.RefundQuote(setInfo(), window, refundMinor));
	}

	private static SetBookingInfo setInfo() {
		return new SetBookingInfo(SET, VENUE, "Miramar", "Front row", 2, "ONLINE",
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0), LocalTime.of(16, 0),
				BookingMode.INSTANT);
	}
}
