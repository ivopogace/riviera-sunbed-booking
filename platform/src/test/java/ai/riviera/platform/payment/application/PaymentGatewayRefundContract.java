package ai.riviera.platform.payment.application;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.RefundResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * The at-most-once refund contract every <strong>collecting</strong> {@link PaymentGateway} must
 * honour. Subclass it once per collecting adapter; a non-collecting adapter is exempt, and
 * {@code PaymentGatewayContractCoverageArchitectureTest} is what makes both halves of that sentence
 * a build failure rather than a habit.
 *
 * <p>The property under test is not the gateway's own idempotency key. A key is time-bounded — the
 * provider prunes it — while the vehicles that replay a refund (the restart republish, the admin
 * re-drive) routinely fire later than that. So a conforming adapter asks the gateway what it already
 * holds before creating anything. The fixture must therefore <strong>not</strong> dedupe on the
 * provider's key: that is exactly the condition being simulated, and a fixture that quietly dedupes
 * would pass an adapter that has no such read.
 *
 * <p>Public because each subclass lives in its own adapter's package, so that its package-private
 * adapter is constructible. A test-scope contract, not a published surface.
 *
 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
 */
public abstract class PaymentGatewayRefundContract {

	protected static final BookingRef BOOKING = new BookingRef(4242L);

	protected static final Money AMOUNT = new Money(4500L, "EUR");

	/** The adapter under test, wired to whatever the most recent {@code gateway…} arrangement set up. */
	protected abstract PaymentGateway gateway();

	/** Arrange: the gateway holds a collection for {@code booking} and no refund against it. */
	protected abstract void gatewayCollected(BookingRef booking, Money amount);

	/**
	 * Arrange: the gateway holds a collection <em>and</em> a refund against it that returned no money
	 * (the provider's dead statuses). Seeding it must not count towards
	 * {@link #refundsCreatedThroughThePort()}.
	 */
	protected abstract void gatewayHoldsADeadRefund(BookingRef booking, Money amount, String refundId);

	/** How many refunds the gateway actually minted because of a {@code refund} call. */
	protected abstract long refundsCreatedThroughThePort();

	@Test
	void replayingBeyondTheKeyWindowMovesMoneyOnlyOnce() {
		gatewayCollected(BOOKING, AMOUNT);
		RefundResult first = gateway().refund(BOOKING, AMOUNT);
		String firstRefundId = assertInstanceOf(RefundResult.Refunded.class, first,
				"a collected booking's refund succeeds").refundId();

		RefundResult replay = gateway().refund(BOOKING, AMOUNT);

		assertEquals(firstRefundId, assertInstanceOf(RefundResult.Refunded.class, replay,
						"a replay reports the refund that already moved, it does not fail").refundId(),
				"the replay must report the first refund — a second id means a second refund");
		assertEquals(1L, refundsCreatedThroughThePort(),
				"the guest is refunded once however often the caller replays, key window or not");
	}

	@Test
	void aRefundThatReturnedNothingDoesNotBlockAFreshAttempt() {
		gatewayHoldsADeadRefund(BOOKING, AMOUNT, "dead-refund");

		RefundResult result = gateway().refund(BOOKING, AMOUNT);

		assertNotEquals("dead-refund", assertInstanceOf(RefundResult.Refunded.class, result,
						"a refund that returned no money leaves the platform still owing it").refundId(),
				"adopting a dead refund would report a guest as paid who never was");
		assertEquals(1L, refundsCreatedThroughThePort(),
				"so a fresh refund is created — at-most-once is not at-most-zero");
	}
}
