package ai.riviera.platform.payment.adapter.out;

import java.util.Optional;

import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.model.Refund;
import com.stripe.net.RequestOptions;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;
import com.stripe.param.RefundListParams;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.RefundService;

import com.stripe.service.V1Services;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundResult;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.domain.PaymentStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit test of the Stripe collection adapter (issue #8, AC-1/AC-10) with a mocked
 * {@link StripeClient} — no live Stripe call. Pins the boundary contract: the PaymentIntent is
 * created with the amount in <strong>integer minor units</strong> and lowercase ISO currency
 * (invariant #5), an <strong>idempotency key derived from the booking id</strong> (invariant
 * #8), and the booking id in metadata; the record is persisted and a {@link PaymentOutcome.Pending}
 * carrying the client secret is returned; a Stripe failure maps to {@code Failed} (narrow catch,
 * never throws to the caller). In the adapter's own package so the package-private class is the
 * test surface.
 */
class StripePaymentGatewayTest {

	private static final BookingRef BOOKING = new BookingRef(42L);
	private static final String INTENT = "pi_abc";
	private static final String REFUND_SUCCEEDED = "succeeded";

	/**
	 * The refund-path fixture: a gateway wired to a mocked Stripe refund service, the booking's
	 * recorded PaymentIntent, and a real registry so the adoption counter can be read back.
	 */
	private record RefundFixture(StripePaymentGateway gateway, RefundService refunds, Payments payments,
			SimpleMeterRegistry meters) {

		double adoptedCount() {
			return meters.counter(ObservabilityMetrics.REFUNDS_ADOPTED).count();
		}
	}

	private static RefundFixture refundFixture() {
		StripeClient stripe = mock(StripeClient.class);
		RefundService refunds = mock(RefundService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.refunds()).thenReturn(refunds);
		when(payments.findIntentByBookingRef(BOOKING)).thenReturn(Optional.of(INTENT));
		SimpleMeterRegistry meters = new SimpleMeterRegistry();
		return new RefundFixture(new StripePaymentGateway(stripe, payments, meters), refunds, payments, meters);
	}

	/** Stub what Stripe already holds against the intent — no arguments means "no refund yet". */
	private static void stripeHolds(RefundService refunds, Refund... existing) throws StripeException {
		when(refunds.list(any(RefundListParams.class))).thenReturn(StripeRefunds.page(existing));
	}

	private static Refund stripeRefund(String id, String status, Long amount) {
		return StripeRefunds.refund(id, status, amount);
	}

	@Test
	void createsIntentWithIdempotencyKeyAndMinorUnits() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);

		PaymentIntent created = mock(PaymentIntent.class);
		when(created.getId()).thenReturn("pi_abc");
		when(created.getClientSecret()).thenReturn("pi_abc_secret_xyz");
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenReturn(created);

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentOutcome outcome = gateway.initiate(new BookingRef(42L), new Money(4500L, "EUR"));

		PaymentOutcome.Pending pending = assertInstanceOf(PaymentOutcome.Pending.class, outcome,
				"a created PaymentIntent yields Pending — the booking confirms only on the webhook");
		assertEquals("pi_abc_secret_xyz", pending.clientSecret());
		assertEquals("pi_abc", pending.paymentIntentId());

		ArgumentCaptor<PaymentIntentCreateParams> params =
				ArgumentCaptor.forClass(PaymentIntentCreateParams.class);
		ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
		verify(intents).create(params.capture(), options.capture());
		assertEquals(4500L, params.getValue().getAmount(), "amount is integer minor units (invariant #5)");
		assertEquals("eur", params.getValue().getCurrency(), "currency is lowercase ISO at the Stripe edge");
		assertEquals("42", params.getValue().getMetadata().get("bookingRef"),
				"booking id travels in metadata for correlation");
		assertEquals("booking-42-pi", options.getValue().getIdempotencyKey(),
				"idempotency key is derived from the booking id (invariant #8)");

		verify(payments).register(new NewPayment(new BookingRef(42L), "pi_abc", 4500L, "EUR", "pi_abc_secret_xyz"));
	}

	@Test
	void stripeFailureMapsToFailed() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);

		StripeException boom = mock(StripeException.class);
		when(boom.getCode()).thenReturn("card_declined");
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenThrow(boom);

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentOutcome outcome = gateway.initiate(new BookingRef(7L), new Money(3000L, "EUR"));

		PaymentOutcome.Failed failed = assertInstanceOf(PaymentOutcome.Failed.class, outcome,
				"a Stripe error is a typed Failed outcome, never a thrown exception to the caller");
		assertEquals("card_declined", failed.reason());
		verify(intents, times(1)).create(any(PaymentIntentCreateParams.class), any(RequestOptions.class));
	}

	@Test
	void recoversAndRegistersWhenCreateTimesOutAfterStripeCreated() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);

		PaymentIntent created = mock(PaymentIntent.class);
		when(created.getId()).thenReturn("pi_recovered");
		when(created.getClientSecret()).thenReturn("pi_recovered_secret");
		// First attempt: Stripe created the PI but the response was lost to a read timeout
		// (ApiConnectionException). The idempotent replay returns the SAME PI Stripe already created.
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenThrow(new ApiConnectionException("simulated read timeout"))
				.thenReturn(created);

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentOutcome outcome = gateway.initiate(new BookingRef(42L), new Money(4500L, "EUR"));

		PaymentOutcome.Pending pending = assertInstanceOf(PaymentOutcome.Pending.class, outcome,
				"a recovered PaymentIntent yields Pending — the booking still confirms only on the webhook");
		assertEquals("pi_recovered_secret", pending.clientSecret());
		assertEquals("pi_recovered", pending.paymentIntentId());

		// Replayed exactly once, with the SAME idempotency key so Stripe returns the original PI
		// (one PaymentIntent per booking — never a second, no double-charge).
		ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
		verify(intents, times(2)).create(any(PaymentIntentCreateParams.class), options.capture());
		options.getAllValues().forEach(o -> assertEquals("booking-42-pi", o.getIdempotencyKey(),
				"both attempts carry the booking-derived idempotency key (issue #66 recovery, invariant #8)"));

		// The recovered intent is now recorded — never left orphaned-and-untracked at Stripe.
		verify(payments).register(new NewPayment(new BookingRef(42L), "pi_recovered", 4500L, "EUR", "pi_recovered_secret"));
	}

	@Test
	void failsWhenBothCreateAttemptsTimeOut() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);

		// Both the first call and the idempotent replay time out — the documented residual.
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenThrow(new ApiConnectionException("timeout 1"))
				.thenThrow(new ApiConnectionException("timeout 2"));

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentOutcome outcome = gateway.initiate(new BookingRef(7L), new Money(3000L, "EUR"));

		assertInstanceOf(PaymentOutcome.Failed.class, outcome,
				"a double timeout falls through to Failed — Stripe auto-expires the unconfirmed PI (no charge)");
		// Exactly one replay (two attempts total), and nothing registered on the double failure.
		verify(intents, times(2)).create(any(PaymentIntentCreateParams.class), any(RequestOptions.class));
		verify(payments, never()).register(any());
	}

	@Test
	void refundUsesIdempotencyKeyAndRecordsTheRefund() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds());

		Refund created = stripeRefund("re_xyz", REFUND_SUCCEEDED, 2250L);
		when(fixture.refunds().create(any(RefundCreateParams.class), any(RequestOptions.class)))
				.thenReturn(created);

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result);
		assertEquals("re_xyz", refunded.refundId());

		ArgumentCaptor<RefundCreateParams> params = ArgumentCaptor.forClass(RefundCreateParams.class);
		ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
		verify(fixture.refunds()).create(params.capture(), options.capture());
		assertEquals(INTENT, params.getValue().getPaymentIntent(), "refund targets the booking's PaymentIntent");
		assertEquals(2250L, params.getValue().getAmount(), "amount is integer minor units (invariant #5)");
		assertEquals("booking-42-refund", options.getValue().getIdempotencyKey(),
				"refund idempotency key is derived from the booking id (invariant #8/#10)");
		verify(fixture.payments()).markRefunded(BOOKING, 2250L, "re_xyz");
		assertEquals(0.0, fixture.adoptedCount(), "a freshly created refund is not an adoption");
	}

	@Test
	void doesNotRecordARefundStripeAnswersAsAlreadyDead() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds());
		when(fixture.refunds().create(any(RefundCreateParams.class), any(RequestOptions.class)))
				.thenReturn(stripeRefund("re_born_dead", "failed", 2250L));

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		RefundResult.Failed failed = assertInstanceOf(RefundResult.Failed.class, result,
				"a refund that returned nothing is not a refund, however new its id is");
		assertEquals("refund_returned_nothing", failed.reason());
		verify(fixture.payments(), never()).markRefunded(any(), anyLong(), any());
	}

	@Test
	void refusesTheDeadRefundAnUnexpiredKeyReplaysInsteadOfRecordingItAgain() throws StripeException {
		RefundFixture fixture = refundFixture();
		Refund dead = stripeRefund("re_dead", "failed", 2250L);
		stripeHolds(fixture.refunds(), dead);
		// Inside the key window the create is not a create: Stripe replays the original response.
		when(fixture.refunds().create(any(RefundCreateParams.class), any(RequestOptions.class)))
				.thenReturn(dead);

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		RefundResult.Failed failed = assertInstanceOf(RefundResult.Failed.class, result,
				"a replayed corpse is not a refund — reporting success would strand the guest");
		assertEquals("refund_key_replay", failed.reason());
		verify(fixture.payments(), never()).markRefunded(any(), anyLong(), any());
	}

	@Test
	void adoptsAnExistingStripeRefundInsteadOfCreatingASecond() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds(), stripeRefund("re_first", REFUND_SUCCEEDED, 2250L));

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		// The key window has passed, so the key would no longer stop a second refund — the read does.
		verify(fixture.refunds(), never()).create(any(RefundCreateParams.class), any(RequestOptions.class));
		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result,
				"the refund already happened at Stripe — the caller is told it succeeded, not that it failed");
		assertEquals("re_first", refunded.refundId());
		verify(fixture.payments()).markRefunded(BOOKING, 2250L, "re_first");
	}

	@Test
	void looksForExistingRefundsOnlyOnThisBookingsPaymentIntent() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds());
		Refund created = stripeRefund("re_xyz", REFUND_SUCCEEDED, 2250L);
		when(fixture.refunds().create(any(RefundCreateParams.class), any(RequestOptions.class)))
				.thenReturn(created);

		fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		// Unscoped, the read would return the account's refunds and every booking would adopt a stranger's.
		ArgumentCaptor<RefundListParams> params = ArgumentCaptor.forClass(RefundListParams.class);
		verify(fixture.refunds()).list(params.capture());
		assertEquals(INTENT, params.getValue().getPaymentIntent(),
				"the existence read is scoped to this booking's PaymentIntent — the whole guarantee rests on it");
	}

	@Test
	void countsAnAdoptedRefund() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds(), stripeRefund("re_first", REFUND_SUCCEEDED, 2250L));

		fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		assertEquals(1.0, fixture.adoptedCount(),
				"adopting a refund means an earlier attempt lost its response — ops can see it happened");
	}

	@Test
	void refusesToActWhenTheHeldRefundIsSmallerThanTheOneRequested() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds(), stripeRefund("re_manual", REFUND_SUCCEEDED, 1000L));

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(4500L, "EUR"));

		// Reporting success here would complete the publication and strand a guest still owed 3500.
		verify(fixture.refunds(), never()).create(any(RefundCreateParams.class), any(RequestOptions.class));
		RefundResult.Failed failed = assertInstanceOf(RefundResult.Failed.class, result,
				"a shortfall is neither adopted nor topped up — it stays outstanding for a human");
		assertEquals("refund_mismatch", failed.reason());
		verify(fixture.payments(), never()).markRefunded(any(), anyLong(), any());
		assertEquals(0.0, fixture.adoptedCount());
	}

	@Test
	void refusesToActWhenSeveralLiveRefundsAreHeld() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds(), stripeRefund("re_a", REFUND_SUCCEEDED, 1125L),
				stripeRefund("re_b", REFUND_SUCCEEDED, 1125L));

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		// Summing them would record one refund's id against another's money; the pair needs a human.
		verify(fixture.refunds(), never()).create(any(RefundCreateParams.class), any(RequestOptions.class));
		assertInstanceOf(RefundResult.Failed.class, result);
		verify(fixture.payments(), never()).markRefunded(any(), anyLong(), any());
	}

	@Test
	void refusesToActWhenTheHeldRefundReportsNoAmount() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds(), stripeRefund("re_amountless", REFUND_SUCCEEDED, null));

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		// An unboxing NPE here would escape the StripeException catch and wedge the publication forever.
		assertInstanceOf(RefundResult.Failed.class, result,
				"an amount the gateway did not report is refused, not unboxed");
		verify(fixture.payments(), never()).markRefunded(any(), anyLong(), any());
	}

	@Test
	void failsClosedWhenTheExistingRefundReadFails() throws StripeException {
		RefundFixture fixture = refundFixture();
		StripeException boom = mock(StripeException.class);
		when(boom.getCode()).thenReturn("rate_limit");
		when(fixture.refunds().list(any(RefundListParams.class))).thenThrow(boom);

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		verify(fixture.refunds(), never()).create(any(RefundCreateParams.class), any(RequestOptions.class));
		RefundResult.Failed failed = assertInstanceOf(RefundResult.Failed.class, result,
				"an unreadable refund list must not be read as 'no refund exists'");
		assertEquals("rate_limit", failed.reason());
		verify(fixture.payments(), never()).markRefunded(any(), anyLong(), any());
	}

	@ParameterizedTest
	@ValueSource(strings = {"failed", "canceled"})
	void createsAFreshRefundWhenTheOnlyStripeRefundIsDead(String deadStatus) throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds(), stripeRefund("re_dead", deadStatus, 2250L));
		Refund created = stripeRefund("re_new", REFUND_SUCCEEDED, 2250L);
		when(fixture.refunds().create(any(RefundCreateParams.class), any(RequestOptions.class)))
				.thenReturn(created);

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		// A dead refund returned no money, so the tourist is still owed it.
		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result);
		assertEquals("re_new", refunded.refundId());
		verify(fixture.payments()).markRefunded(BOOKING, 2250L, "re_new");
		assertEquals(0.0, fixture.adoptedCount());
	}

	@Test
	void recoversAndRecordsWhenRefundCreateTimesOut() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds());
		Refund recovered = stripeRefund("re_recovered", REFUND_SUCCEEDED, 2250L);
		when(fixture.refunds().create(any(RefundCreateParams.class), any(RequestOptions.class)))
				.thenThrow(new ApiConnectionException("simulated read timeout"))
				.thenReturn(recovered);

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result,
				"the replay resolves the lost response inside the key window");
		assertEquals("re_recovered", refunded.refundId());

		ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
		verify(fixture.refunds(), times(2)).create(any(RefundCreateParams.class), options.capture());
		options.getAllValues().forEach(o -> assertEquals("booking-42-refund", o.getIdempotencyKey(),
				"both attempts carry the same key, so Stripe returns the refund it already made"));
		verify(fixture.payments()).markRefunded(BOOKING, 2250L, "re_recovered");
		assertEquals(0.0, fixture.adoptedCount(), "a same-key replay is a recovery, not an adoption");
	}

	@Test
	void failsWhenBothRefundAttemptsTimeOut() throws StripeException {
		RefundFixture fixture = refundFixture();
		stripeHolds(fixture.refunds());
		when(fixture.refunds().create(any(RefundCreateParams.class), any(RequestOptions.class)))
				.thenThrow(new ApiConnectionException("timeout 1"))
				.thenThrow(new ApiConnectionException("timeout 2"));

		RefundResult result = fixture.gateway().refund(BOOKING, new Money(2250L, "EUR"));

		assertInstanceOf(RefundResult.Failed.class, result,
				"the publication stays outstanding; the next replay adopts whatever Stripe ended up holding");
		verify(fixture.refunds(), times(2)).create(any(RefundCreateParams.class), any(RequestOptions.class));
		verify(fixture.payments(), never()).markRefunded(any(), anyLong(), any());
	}

	@Test
	void refundWithoutAKnownCollectionFails() {
		StripeClient stripe = mock(StripeClient.class);
		Payments payments = mock(Payments.class);
		when(payments.findIntentByBookingRef(new BookingRef(99L))).thenReturn(Optional.empty());

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		RefundResult result = gateway.refund(new BookingRef(99L), new Money(1000L, "EUR"));

		RefundResult.Failed failed = assertInstanceOf(RefundResult.Failed.class, result,
				"with no recorded PaymentIntent there is nothing to refund");
		assertEquals("no_collection", failed.reason());
	}

	@Test
	void cancelVoidsACancelableIntentAndMarksItCanceled() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		when(payments.findIntentByBookingRef(new BookingRef(42L))).thenReturn(Optional.of("pi_abc"));

		PaymentIntent intent = mock(PaymentIntent.class);
		when(intent.getStatus()).thenReturn("requires_payment_method");
		when(intents.retrieve("pi_abc")).thenReturn(intent);

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentCancellation outcome = gateway.cancel(new BookingRef(42L));

		assertInstanceOf(PaymentCancellation.Canceled.class, outcome,
				"a cancelable PaymentIntent is voided so it can no longer succeed");
		verify(intent).cancel();
		verify(payments).markStatus("pi_abc", PaymentStatus.CANCELED);
	}

	@Test
	void cancelOfAnAlreadyCanceledIntentIsIdempotent() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		when(payments.findIntentByBookingRef(new BookingRef(42L))).thenReturn(Optional.of("pi_abc"));

		PaymentIntent intent = mock(PaymentIntent.class);
		when(intent.getStatus()).thenReturn("canceled");
		when(intents.retrieve("pi_abc")).thenReturn(intent);

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentCancellation outcome = gateway.cancel(new BookingRef(42L));

		assertInstanceOf(PaymentCancellation.Canceled.class, outcome,
				"an already-canceled PaymentIntent is a benign success (idempotent)");
		verify(intent, never()).cancel();
		verify(payments).markStatus("pi_abc", PaymentStatus.CANCELED);
	}

	@Test
	void cancelOfASucceededIntentIsNotCancellable() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		when(payments.findIntentByBookingRef(new BookingRef(42L))).thenReturn(Optional.of("pi_abc"));

		PaymentIntent intent = mock(PaymentIntent.class);
		when(intent.getStatus()).thenReturn("succeeded");
		when(intents.retrieve("pi_abc")).thenReturn(intent);

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentCancellation outcome = gateway.cancel(new BookingRef(42L));

		PaymentCancellation.NotCancellable nc = assertInstanceOf(PaymentCancellation.NotCancellable.class,
				outcome, "a succeeded payment must not be cancelled — the confirm webhook wins (invariant #8)");
		assertEquals("succeeded", nc.reason());
		verify(intent, never()).cancel();
		verify(payments, never()).markStatus(any(), any());
	}

	@Test
	void cancelWithoutAKnownCollectionReportsNoCollection() {
		StripeClient stripe = mock(StripeClient.class);
		Payments payments = mock(Payments.class);
		when(payments.findIntentByBookingRef(new BookingRef(99L))).thenReturn(Optional.empty());

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentCancellation outcome = gateway.cancel(new BookingRef(99L));

		// #125: distinct from NotCancellable (which means "succeeded, the webhook wins"). NoCollection
		// means there is no payment on record at all — the sweep may safely release a stranded row.
		assertInstanceOf(PaymentCancellation.NoCollection.class, outcome,
				"with no recorded PaymentIntent there is nothing to cancel at Stripe");
	}

	@Test
	void cancelStripeFailureMapsToFailed() throws StripeException {
		StripeClient stripe = mock(StripeClient.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		V1Services v1 = mock(V1Services.class);
		Payments payments = mock(Payments.class);
		when(stripe.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		when(payments.findIntentByBookingRef(new BookingRef(7L))).thenReturn(Optional.of("pi_boom"));

		StripeException boom = mock(StripeException.class);
		when(boom.getCode()).thenReturn("lock_timeout");
		when(intents.retrieve("pi_boom")).thenThrow(boom);

		StripePaymentGateway gateway =
				new StripePaymentGateway(stripe, payments, new SimpleMeterRegistry());
		PaymentCancellation outcome = gateway.cancel(new BookingRef(7L));

		PaymentCancellation.Failed failed = assertInstanceOf(PaymentCancellation.Failed.class, outcome,
				"a transient Stripe error is a typed Failed outcome — the sweep retries next round");
		assertEquals("lock_timeout", failed.reason());
	}
}
