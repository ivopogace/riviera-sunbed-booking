package ai.riviera.platform.booking.adapter.out;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.core.PublicationTargetIdentifier;
import org.springframework.modulith.events.core.TargetEventPublication;

import ai.riviera.platform.booking.adapter.in.BookingListenerIds;
import ai.riviera.platform.notification.BookingMailFixtures;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The scoping half of the decision that keeps a button labelled "refund" off every other
 * listener, including the two that share its module.
 *
 * <p><strong>Why the scope is an exact-id allowlist and not a package prefix.</strong> The
 * notification module's listener-id-prefix scope is safe because every listener in {@code notification}
 * is a mail listener. This module also hosts
 * {@code PaymentEventListener} — payment → confirm (invariant #8) and payment-cancel → availability
 * release (invariant #2) — so {@code ai.riviera.platform.booking.} would hand an admin button the
 * payment spine. The allowlist loses that prefix scope's "future listeners covered automatically"
 * property, and for money that is a feature: a listener joins the scope deliberately, with review. The
 * two that have are the two on the refund bulkhead, so the lever reaches everything that pool can shed.
 *
 * <p><strong>How each id is kept honest, two levels.</strong> This test pins
 * {@link RegistryRefundOutbox#REFUND_LISTENER_ID} and
 * {@link RegistryRefundOutbox#RELEASE_VOID_LISTENER_ID} against {@link BookingListenerIds}, which
 * derives them from the class literals (compile-safe against a rename); {@code RefundBulkheadIT} pins
 * that derivation against the id the live registry writes. A stale string here would otherwise be a
 * silent no-op lever — the V31 failure mode one level up.
 */
class RefundOutboxScopeTest {

	/** The invariant-#9 listeners that share this scope's events — out of reach by exact match. */
	private static final String PAYOUT_ACCRUAL_LISTENER_ID = "ai.riviera.platform.payout.adapter.in."
			+ "BookingConfirmedPayoutListener.on(ai.riviera.platform.booking.events.BookingConfirmed)";

	private static final String PAYOUT_REVERSAL_LISTENER_ID = "ai.riviera.platform.payout.adapter.in."
			+ "BookingCancelledPayoutListener.on(ai.riviera.platform.booking.events.BookingCancelled)";

	@Test
	@DisplayName("each constant is its listener's real id (level 1 of the two-level pin)")
	void pinsTheConstantsAgainstTheListenersRealIds() {
		assertEquals(BookingListenerIds.REFUND, RegistryRefundOutbox.REFUND_LISTENER_ID);
		assertEquals(BookingListenerIds.REMODEL_RELEASE_VOID, RegistryRefundOutbox.RELEASE_VOID_LISTENER_ID);
	}

	@Test
	@DisplayName("the refund listener's publication is in scope")
	void matchesTheRefundListenersPublication() {
		assertTrue(RegistryRefundOutbox.isRefundPublication(publicationFor(BookingListenerIds.REFUND)));
	}

	/**
	 * The second allowed id. It shares the refund executor, so the same saturation that sheds a refund
	 * sheds this void — and an un-voided intent stays chargeable to a guest whose booking is gone.
	 */
	@Test
	@DisplayName("the remodel release's intent-void publication is in scope")
	void matchesTheRemodelReleaseVoidPublication() {
		assertTrue(RegistryRefundOutbox
				.isRefundPublication(publicationFor(BookingListenerIds.REMODEL_RELEASE_VOID)));
	}

	/**
	 * The reason the scope is exact and the issue's AC-2 names {@code PaymentConfirmed}: a
	 * {@code BookingCancelled}-only check never exercises {@code PaymentEventListener} and would pass
	 * green with a package-prefix scope.
	 */
	@Test
	@DisplayName("this module's own payment listeners are out of scope (invariant #8)")
	void excludesThisModulesPaymentListeners() {
		assertFalse(RegistryRefundOutbox
				.isRefundPublication(publicationFor(BookingListenerIds.PAYMENT_CONFIRMED)));
		assertFalse(RegistryRefundOutbox
				.isRefundPublication(publicationFor(BookingListenerIds.PAYMENT_CANCELED)));
	}

	@Test
	@DisplayName("the sibling subscribers on BookingCancelled are out of scope (invariants #9, #7)")
	void excludesTheOtherBookingCancelledSubscribers() {
		assertFalse(RegistryRefundOutbox.isRefundPublication(publicationFor(PAYOUT_REVERSAL_LISTENER_ID)));
		assertFalse(RegistryRefundOutbox.isRefundPublication(publicationFor(PAYOUT_ACCRUAL_LISTENER_ID)));
		assertFalse(RegistryRefundOutbox
				.isRefundPublication(publicationFor(BookingMailFixtures.CANCELLATION_LISTENER_ID)));
	}

	/** Exact equality, not prefix: an id that merely starts with the allowed one stays out. */
	@Test
	@DisplayName("a near-miss sharing the exact id as a prefix is out of scope")
	void excludesANearMissSharingThePrefix() {
		assertFalse(RegistryRefundOutbox
				.isRefundPublication(publicationFor(BookingListenerIds.REFUND + "x")));
	}

	/**
	 * A publication carrying no target identifier cannot be attributed to a listener, so the scope
	 * refuses it — fail-closed, because including an unattributable publication could replay a ledger
	 * accrual or the payment spine, while excluding one costs a press of the unscoped restart lever.
	 */
	@Test
	@DisplayName("an unattributable publication is out of scope, not in it")
	void excludesAPublicationWithNoTarget() {
		assertFalse(RegistryRefundOutbox.isRefundPublication(new UntargetedPublication()));
	}

	private static TargetEventPublication publicationFor(String listenerId) {
		return TargetEventPublication.of(new Object(), PublicationTargetIdentifier.of(listenerId));
	}

	/** An {@link EventPublication} that is not a {@link TargetEventPublication} — the fail-closed case. */
	private static final class UntargetedPublication implements EventPublication {

		private final UUID id = UUID.randomUUID();

		private final Instant publishedAt = Instant.EPOCH;

		@Override
		public UUID getIdentifier() {
			return id;
		}

		@Override
		public Object getEvent() {
			return new Object();
		}

		@Override
		public Instant getPublicationDate() {
			return publishedAt;
		}

		@Override
		public Optional<Instant> getCompletionDate() {
			return Optional.empty();
		}

		@Override
		public Status getStatus() {
			return Status.PUBLISHED;
		}

		@Override
		public Instant getLastResubmissionDate() {
			return publishedAt;
		}

		@Override
		public int getCompletionAttempts() {
			return 0;
		}
	}
}
