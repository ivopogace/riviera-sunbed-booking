package ai.riviera.platform.payment.application;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.payment.vocabulary.RefundProgress;
import ai.riviera.platform.payment.vocabulary.RefundResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * Unit test of the refund seam (U6): {@code RefundService} delegates the inbound {@code RefundPort}
 * to the outbound {@link PaymentGateway} verbatim (the refund sibling of {@code PaymentService}),
 * and answers the read side of the same conversation — {@code RefundStatusLookup#progressOf} — from
 * the {@link Payments} record. In the same package so the package-private service is the test
 * surface; gateway and persistence are fakes.
 */
class RefundServiceTest {

	private static final BookingRef BOOKING = new BookingRef(42L);

	private RefundService serviceWithState(Optional<RefundState> state) {
		PaymentGateway gateway = (RefundOnlyGateway) (booking, amount) -> {
			throw new UnsupportedOperationException("progressOf must not touch the gateway");
		};
		return new RefundService(gateway, new SimpleMeterRegistry(), (StateOnlyPayments) booking -> state);
	}

	@Test
	void delegatesRefundToGateway() {
		PaymentGateway fake = (RefundOnlyGateway) (booking, amount) ->
				new RefundResult.Refunded("re-" + booking.value() + "-" + amount.minor());
		RefundService service = new RefundService(fake, new SimpleMeterRegistry(),
				(StateOnlyPayments) booking -> {
					throw new UnsupportedOperationException("refund must not read the payment row");
				});

		RefundResult result = service.refund(BOOKING, new Money(2250L, "EUR"));

		RefundResult.Refunded refunded = assertInstanceOf(RefundResult.Refunded.class, result);
		assertEquals("re-42-2250", refunded.refundId(), "service passes booking + amount through unchanged");
	}

	@Test
	void progressReportsNoCollectionWithoutAPaymentRow() {
		RefundService service = serviceWithState(Optional.empty());

		assertEquals(RefundProgress.NO_COLLECTION, service.progressOf(BOOKING),
				"no payment row means this gateway never collected — never a failed refund (issue #581 trap 1)");
	}

	@Test
	void progressReportsNoCollectionForANeverSucceededIntent() {
		for (PaymentStatus status : new PaymentStatus[] {
				PaymentStatus.REQUIRES_PAYMENT, PaymentStatus.FAILED, PaymentStatus.CANCELED }) {
			RefundService service = serviceWithState(Optional.of(new RefundState(status, 0L)));

			assertEquals(RefundProgress.NO_COLLECTION, service.progressOf(BOOKING),
					"an intent that never succeeded collected nothing to return (" + status + ")");
		}
	}

	@Test
	void progressReportsOutstandingForAnUnrefundedCollection() {
		RefundService service = serviceWithState(Optional.of(new RefundState(PaymentStatus.SUCCEEDED, 0L)));

		assertEquals(RefundProgress.OUTSTANDING, service.progressOf(BOOKING),
				"collected but no refund accepted yet — the stuck-outbox case");
	}

	@Test
	void progressReportsAcceptedOnceTheGatewayRefunded() {
		RefundService full = serviceWithState(Optional.of(new RefundState(PaymentStatus.REFUNDED, 4500L)));
		RefundService partial = serviceWithState(
				Optional.of(new RefundState(PaymentStatus.PARTIALLY_REFUNDED, 2250L)));

		assertEquals(RefundProgress.ACCEPTED, full.progressOf(BOOKING));
		assertEquals(RefundProgress.ACCEPTED, partial.progressOf(BOOKING),
				"a partial after-cutoff refund is accepted the same as a full one");
	}

	/** A {@link PaymentGateway} whose only lambda-targetable method is {@code refund}. */
	@FunctionalInterface
	private interface RefundOnlyGateway extends PaymentGateway {
		@Override
		default PaymentOutcome initiate(BookingRef booking, Money amount) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}

		@Override
		default PaymentCancellation cancel(BookingRef booking) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}
	}

	/** A {@link Payments} whose only lambda-targetable method is {@code findRefundState}. */
	@FunctionalInterface
	private interface StateOnlyPayments extends Payments {
		@Override
		default void register(NewPayment payment) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}

		@Override
		default Optional<PaymentCredentials> findPendingCredentials(BookingRef booking) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}

		@Override
		default Optional<BookingRef> findBookingRefByIntent(String paymentIntentId) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}

		@Override
		default void markStatus(String paymentIntentId, PaymentStatus status) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}

		@Override
		default Optional<String> findIntentByBookingRef(BookingRef booking) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}

		@Override
		default void markRefunded(BookingRef booking, long refundedMinor, String refundId) {
			throw new UnsupportedOperationException("not exercised by RefundServiceTest");
		}
	}
}
