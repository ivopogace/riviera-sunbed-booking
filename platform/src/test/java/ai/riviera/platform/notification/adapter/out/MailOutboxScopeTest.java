package ai.riviera.platform.notification.adapter.out;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.core.PublicationTargetIdentifier;
import org.springframework.modulith.events.core.TargetEventPublication;

import ai.riviera.platform.notification.BookingMailFixtures;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The scoping half of the decision that keeps a button labelled "mail" off the money path.
 *
 * <p><strong>Why the scope is a listener-id prefix and not an event type.</strong>
 * {@code BookingConfirmed} fans out to <em>two</em> listeners: this module's confirmation mail and
 * {@code payout}'s accrual (invariant #9). A predicate written against
 * {@link EventPublication#getEvent()} — the only discriminator the published
 * {@code spring-modulith-events-api} exposes — therefore cannot tell them apart, and would resubmit a
 * stuck ledger accrual as a side effect of retrying a mail. The instances the registry actually hands
 * the predicate are {@link TargetEventPublication}, which carries the listener id, so the scope is
 * "publications targeted at a listener this module owns".
 *
 * <p><strong>How the prefix is kept honest.</strong> The chain is closed in two links: this test pins
 * {@link RegistryMailOutbox#NOTIFICATION_LISTENER_PREFIX} against
 * {@link BookingMailFixtures#LISTENER_ID}, and {@code RegistryMailBulkheadIT} pins that same
 * constant against the id the live registry writes. Move the listener's package without the V31-style
 * rewrite and the second link goes red; change the prefix so it stops covering the module and the
 * first does.
 */
class MailOutboxScopeTest {

	/** The money-path listeners AC-2 exists to protect — invariant #9 and, through the refund, #8. */
	private static final String PAYOUT_ACCRUAL_LISTENER_ID = "ai.riviera.platform.payout.adapter.in."
			+ "BookingConfirmedPayoutListener.on(ai.riviera.platform.booking.events.BookingConfirmed)";

	private static final String PAYOUT_REVERSAL_LISTENER_ID = "ai.riviera.platform.payout.adapter.in."
			+ "BookingCancelledPayoutListener.on(ai.riviera.platform.booking.events.BookingCancelled)";

	private static final String REFUND_LISTENER_ID = "ai.riviera.platform.booking.adapter.in."
			+ "BookingRefundListener.on(ai.riviera.platform.booking.events.BookingCancelled)";

	private static final String PAYMENT_LISTENER_ID = "ai.riviera.platform.booking.adapter.in."
			+ "PaymentEventListener.on(ai.riviera.platform.payment.events.PaymentConfirmed)";

	@Test
	@DisplayName("the confirmation-mail publication is in scope")
	void matchesThisModulesMailListener() {
		assertTrue(RegistryMailOutbox.isMailPublication(publicationFor(BookingMailFixtures.LISTENER_ID)));
	}

	/**
	 * The prefix scope's payoff, claimed by {@link RegistryMailOutbox}'s Javadoc when only one listener
	 * existed: "new listeners are in scope the day they land, without anyone remembering to add
	 * them." This is the first chance to check that rather than trust it — and the check matters
	 * precisely because {@code BookingCancelled} is the fan-out below, where a stuck refund (invariant
	 * #8) and a stuck reversal (#9) sit under the same event as this mail.
	 */
	@Test
	@DisplayName("the cancellation-mail publication is in scope")
	void scopesTheCancellationListener() {
		assertTrue(RegistryMailOutbox.isMailPublication(
				publicationFor(BookingMailFixtures.CANCELLATION_LISTENER_ID)));
	}

	@Test
	@DisplayName("no money-path publication is in scope (AC-2)")
	void excludesEveryMoneyPathListener() {
		assertFalse(RegistryMailOutbox.isMailPublication(publicationFor(PAYOUT_ACCRUAL_LISTENER_ID)));
		assertFalse(RegistryMailOutbox.isMailPublication(publicationFor(PAYOUT_REVERSAL_LISTENER_ID)));
		assertFalse(RegistryMailOutbox.isMailPublication(publicationFor(REFUND_LISTENER_ID)));
		assertFalse(RegistryMailOutbox.isMailPublication(publicationFor(PAYMENT_LISTENER_ID)));
	}

	/**
	 * A publication carrying no target identifier cannot be attributed to a module, so the scope
	 * refuses it. Fail-closed is the only safe default here: the cost of excluding a mail is a mail
	 * that waits for the next attempt, and the cost of including an unattributable publication is a
	 * replayed ledger accrual.
	 */
	@Test
	@DisplayName("an unattributable publication is out of scope, not in it")
	void excludesAPublicationWithNoTarget() {
		assertFalse(RegistryMailOutbox.isMailPublication(new UntargetedPublication()));
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
