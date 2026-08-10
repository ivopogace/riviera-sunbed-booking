package ai.riviera.platform.payment.adapter.out;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.domain.PaymentStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the {@code payment} persistence adapter against real Postgres (Testcontainers): a
 * recorded PaymentIntent starts {@code REQUIRES_PAYMENT}, is found by its Stripe id for the
 * webhook correlation, and transitions on {@code markStatus}. JDBC-only (invariant #1); skipped
 * where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcPaymentsIT {

	@Autowired
	Payments payments;

	@Autowired
	JdbcClient jdbc;

	private String statusOf(String intentId) {
		return jdbc.sql("SELECT status FROM payment WHERE payment_intent_id = :i")
				.param("i", intentId).query(String.class).single();
	}

	@Test
	void recordStartsRequiresPaymentAndIsFoundByIntent() {
		payments.register(new NewPayment(new BookingRef(9001L), "pi_record_a", 4500L, "EUR", "cs_test_secret"));

		assertEquals("REQUIRES_PAYMENT", statusOf("pi_record_a"),
				"a freshly recorded PaymentIntent awaits payment");
		Optional<BookingRef> ref = payments.findBookingRefByIntent("pi_record_a");
		assertTrue(ref.isPresent(), "the webhook must correlate the PaymentIntent back to its booking");
		assertEquals(9001L, ref.get().value());
	}

	@Test
	void markStatusTransitionsThePayment() {
		payments.register(new NewPayment(new BookingRef(9002L), "pi_mark_b", 4500L, "EUR", "cs_test_secret"));

		payments.markStatus("pi_mark_b", PaymentStatus.SUCCEEDED);

		assertEquals("SUCCEEDED", statusOf("pi_mark_b"), "markStatus moves the payment to the new state");
	}

	@Test
	void lateFailureCannotOverwriteASucceededCollection() {
		payments.register(new NewPayment(new BookingRef(9401L), "pi_late_fail", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_late_fail", PaymentStatus.SUCCEEDED);

		boolean applied = payments.markStatus("pi_late_fail", PaymentStatus.FAILED);

		assertFalse(applied, "a collected payment is terminal — the transition reports no move");
		assertEquals("SUCCEEDED", statusOf("pi_late_fail"),
				"a late payment_failed never overwrites money Stripe collected (invariant #8)");
	}

	@Test
	void lateFailureCannotOverwriteARefundedCollection() {
		payments.register(new NewPayment(new BookingRef(9402L), "pi_late_refunded", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_late_refunded", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9402L), 4500L, "re_late");

		assertFalse(payments.markStatus("pi_late_refunded", PaymentStatus.FAILED),
				"a refunded payment is terminal too");

		var state = payments.findRefundState(new BookingRef(9402L)).orElseThrow();
		assertEquals(PaymentStatus.REFUNDED, state.status(),
				"a late payment_failed never contradicts a recorded refund");
		assertEquals(4500L, state.refundedMinor(), "the refunded amount survives the late event");
	}

	@Test
	void anOpenCollectionStillTransitions() {
		payments.register(new NewPayment(new BookingRef(9403L), "pi_retry", 4500L, "EUR", "cs_test_secret"));

		assertTrue(payments.markStatus("pi_retry", PaymentStatus.FAILED),
				"a freshly recorded intent is open to a webhook outcome");
		assertTrue(payments.markStatus("pi_retry", PaymentStatus.SUCCEEDED),
				"a declined intent may be retried — FAILED is not terminal in Stripe");
		assertEquals("SUCCEEDED", statusOf("pi_retry"), "the retry's success is recorded");
	}

	@Test
	void markStatusOnAnUnknownIntentReportsNoTransition() {
		assertFalse(payments.markStatus("pi_never_recorded", PaymentStatus.SUCCEEDED),
				"an event for an intent this app never recorded moves nothing");
	}

	@Test
	void findByUnknownIntentIsEmpty() {
		assertTrue(payments.findBookingRefByIntent("pi_does_not_exist").isEmpty(),
				"an unknown PaymentIntent id yields no booking ref (webhook then ignores it)");
	}

	@Test
	void findIntentByBookingRefCorrelates() {
		payments.register(new NewPayment(new BookingRef(9101L), "pi_by_booking", 4500L, "EUR", "cs_test_secret"));

		Optional<String> intent = payments.findIntentByBookingRef(new BookingRef(9101L));

		assertTrue(intent.isPresent(), "the refund path must find the PaymentIntent for a booking");
		assertEquals("pi_by_booking", intent.get());
	}

	@Test
	void markRefundedFullMovesToRefunded() {
		payments.register(new NewPayment(new BookingRef(9201L), "pi_refund_full", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_refund_full", PaymentStatus.SUCCEEDED);

		assertTrue(payments.markRefunded(new BookingRef(9201L), 4500L, "re_full"));

		assertEquals("REFUNDED", statusOf("pi_refund_full"), "a full refund moves the payment to REFUNDED");
		assertEquals(4500L, jdbc.sql("SELECT refunded_minor FROM payment WHERE payment_intent_id = :i")
				.param("i", "pi_refund_full").query(Long.class).single());
	}

	@Test
	void markRefundedRefusesAnUncollectedPayment() {
		payments.register(new NewPayment(new BookingRef(9601L), "pi_never_paid", 4500L, "EUR", "cs_test_secret"));

		assertFalse(payments.markRefunded(new BookingRef(9601L), 4500L, "re_phantom"),
				"a refund cannot be recorded against money the gateway never collected");

		assertEquals("REQUIRES_PAYMENT", statusOf("pi_never_paid"),
				"and the un-collected payment keeps its status rather than being asserted as SUCCEEDED");
	}

	@Test
	void markRefundedRefusesACanceledCollection() {
		payments.register(new NewPayment(new BookingRef(9602L), "pi_canceled", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_canceled", PaymentStatus.CANCELED);

		assertFalse(payments.markRefunded(new BookingRef(9602L), 4500L, "re_on_canceled"),
				"a canceled collection holds no money to give back");
		assertEquals("CANCELED", statusOf("pi_canceled"));
	}

	@Test
	void markRefundedReportsNoMoveWithoutAPaymentRow() {
		assertFalse(payments.markRefunded(new BookingRef(9603L), 4500L, "re_no_row"),
				"no payment row (stub profile) moves nothing, and now says so");
	}

	@Test
	void readsRefundStateBackAfterMarkRefunded() {
		payments.register(new NewPayment(new BookingRef(9301L), "pi_refund_state", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_refund_state", PaymentStatus.SUCCEEDED);

		var beforeRefund = payments.findRefundState(new BookingRef(9301L));
		assertTrue(beforeRefund.isPresent(), "a collected payment has readable refund state");
		assertEquals(PaymentStatus.SUCCEEDED, beforeRefund.get().status());
		assertEquals(0L, beforeRefund.get().refundedMinor(), "nothing refunded before the gateway accepts");

		payments.markRefunded(new BookingRef(9301L), 4500L, "re_state");

		var afterRefund = payments.findRefundState(new BookingRef(9301L));
		assertEquals(PaymentStatus.REFUNDED, afterRefund.orElseThrow().status());
		assertEquals(4500L, afterRefund.orElseThrow().refundedMinor(),
				"markRefunded's write is readable back through the same port");
	}

	@Test
	void findRefundStateIsEmptyWithoutAPaymentRow() {
		assertTrue(payments.findRefundState(new BookingRef(9302L)).isEmpty(),
				"no payment row (stub profile) reads as empty, never as a failed refund");
	}

	@Test
	void markRefundedPartialMovesToPartiallyRefunded() {
		payments.register(new NewPayment(new BookingRef(9202L), "pi_refund_part", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_refund_part", PaymentStatus.SUCCEEDED);

		payments.markRefunded(new BookingRef(9202L), 2250L, "re_part");

		assertEquals("PARTIALLY_REFUNDED", statusOf("pi_refund_part"),
				"a partial refund moves the payment to PARTIALLY_REFUNDED");
	}

	@Test
	void markRefundFailedUnrecordsARecordedRefund() {
		payments.register(new NewPayment(new BookingRef(9501L), "pi_refund_died", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_refund_died", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9501L), 4500L, "re_died");

		assertTrue(payments.markRefundFailed("re_died"), "the failure moves the row it was recorded on");

		var state = payments.findRefundState(new BookingRef(9501L)).orElseThrow();
		assertEquals(PaymentStatus.SUCCEEDED, state.status(),
				"no money went back, so the collection stands in full again");
		assertEquals(0L, state.refundedMinor(), "a failed refund returned nothing — the record must say so");
	}

	@Test
	void markRefundFailedUnrecordsAPartialRefundToo() {
		payments.register(new NewPayment(new BookingRef(9502L), "pi_part_died", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_part_died", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9502L), 2250L, "re_part_died");

		assertTrue(payments.markRefundFailed("re_part_died"), "PARTIALLY_REFUNDED is a recorded refund too");
		assertEquals("SUCCEEDED", statusOf("pi_part_died"));
	}

	@Test
	void aSecondFailureForTheSameRefundMovesNothing() {
		payments.register(new NewPayment(new BookingRef(9503L), "pi_twice_died", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_twice_died", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9503L), 4500L, "re_twice_died");
		payments.markRefundFailed("re_twice_died");

		assertFalse(payments.markRefundFailed("re_twice_died"),
				"a re-delivered failure finds no recorded refund left to un-record");
		assertEquals("SUCCEEDED", statusOf("pi_twice_died"), "and it changes nothing on the way past");
	}

	@Test
	void aStaleFailureCannotUnrecordAFreshRefund() {
		payments.register(new NewPayment(new BookingRef(9504L), "pi_stale_fail", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_stale_fail", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9504L), 4500L, "re_first_attempt");
		payments.markRefundFailed("re_first_attempt");
		payments.markRefunded(new BookingRef(9504L), 4500L, "re_second_attempt");

		assertFalse(payments.markRefundFailed("re_first_attempt"),
				"the row now carries the retry's refund id, so the dead one matches nothing");
		assertEquals(4500L, payments.findRefundState(new BookingRef(9504L)).orElseThrow().refundedMinor(),
				"the refund that did work survives its predecessor's late failure");
	}

	@Test
	void markRefundFailedIgnoresAnUnknownRefundId() {
		assertFalse(payments.markRefundFailed("re_never_recorded"),
				"a failure for a refund this app never issued moves nothing");
	}

	@Test
	void markRefundFailedLeavesAQueryableTrace() {
		payments.register(new NewPayment(new BookingRef(9701L), "pi_traced", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_traced", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9701L), 4500L, "re_traced");

		assertTrue(payments.markRefundFailed("re_traced"));

		assertEquals(1, jdbc.sql("""
				SELECT COUNT(*) FROM payment
				WHERE payment_intent_id = 'pi_traced' AND refund_failed_at IS NOT NULL
				  AND failed_refund_id = 're_traced' AND refund_id IS NULL
				""").query(Integer.class).single(),
				"the un-record must be enumerable, not just a WARN line: the dead refund id moves to "
						+ "failed_refund_id and refund_id stops claiming a live refund");
	}

	@Test
	void owedRefundCountCountsDistinctOwedRefunds() {
		long before = payments.owedRefundCount();
		owedRefundOn(9806L, "pi_owed_a", "re_owed_a");
		owedRefundOn(9807L, "pi_owed_b", "re_owed_b");
		payments.markRefundFailed("re_owed_b");

		assertEquals(before + 2, payments.owedRefundCount(),
				"two bookings are owed money, however many failure observations produced them");

		payments.markRefunded(new BookingRef(9807L), 4500L, "re_owed_b_retry");

		assertEquals(before + 1, payments.owedRefundCount(),
				"a retry that worked leaves the booking off the list — the count is owed-now");
	}

	/** A collected payment whose recorded refund the gateway then reported dead. */
	private void owedRefundOn(long bookingRef, String intentId, String refundId) {
		payments.register(new NewPayment(new BookingRef(bookingRef), intentId, 4500L, "EUR", "cs_test_secret"));
		payments.markStatus(intentId, PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(bookingRef));
		payments.markRefunded(new BookingRef(bookingRef), 4500L, refundId);
		payments.markRefundFailed(refundId);
	}

	@Test
	void markUnrecordedRefundFailedMarksTheRacingAttempt() {
		payments.register(new NewPayment(new BookingRef(9801L), "pi_racing", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_racing", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9801L));

		assertFalse(payments.markRefundFailed("re_racing"),
				"the refund is not written down yet, so the id-matched un-record finds nothing");
		assertTrue(payments.markUnrecordedRefundFailed("pi_racing", "re_racing"),
				"but the attempt is on record, so the failure is this platform's and must not be lost");

		assertEquals(1, jdbc.sql("""
				SELECT COUNT(*) FROM payment
				WHERE payment_intent_id = 'pi_racing' AND refund_failed_at IS NOT NULL
				  AND failed_refund_id = 're_racing' AND status = 'SUCCEEDED' AND refunded_minor = 0
				""").query(Integer.class).single(),
				"the guest is owed again, and the booking is enumerable as owed");
	}

	@Test
	void markRefundedRefusesARefundAlreadyReportedDead() {
		payments.register(new NewPayment(new BookingRef(9802L), "pi_lost_race", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_lost_race", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9802L));
		payments.markUnrecordedRefundFailed("pi_lost_race", "re_lost_race");

		assertFalse(payments.markRefunded(new BookingRef(9802L), 4500L, "re_lost_race"),
				"the refund the gateway already killed must never be recorded as a live one");

		var state = payments.findRefundState(new BookingRef(9802L)).orElseThrow();
		assertEquals(PaymentStatus.SUCCEEDED, state.status(),
				"the row must not settle at REFUNDED on the strength of a dead refund");
		assertEquals(0L, state.refundedMinor(), "no money went back, so the guest is still owed it");
	}

	@Test
	void aRedeliveredUnrecordedFailureMovesNothing() {
		payments.register(new NewPayment(new BookingRef(9803L), "pi_twice_raced", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_twice_raced", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9803L));
		payments.markUnrecordedRefundFailed("pi_twice_raced", "re_twice_raced");

		assertFalse(payments.markUnrecordedRefundFailed("pi_twice_raced", "re_twice_raced"),
				"Stripe re-delivers, and both refund types carry the same death — it must count once");
	}

	@Test
	void aResolvedAttemptStopsDiscriminatingForALaterManualRefund() {
		payments.register(new NewPayment(new BookingRef(9808L), "pi_stale_attempt", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_stale_attempt", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9808L));
		payments.markRefunded(new BookingRef(9808L), 4500L, "re_ours");
		payments.markRefundFailed("re_ours");

		assertFalse(payments.markUnrecordedRefundFailed("pi_stale_attempt", "re_by_hand"),
				"our attempt is over — a later refund on this collection is not ours to own");

		assertEquals("re_ours", jdbc.sql("SELECT failed_refund_id FROM payment "
						+ "WHERE payment_intent_id = 'pi_stale_attempt'").query(String.class).single(),
				"and the trace still names the refund that actually died, which is what the runbook looks up");
	}

	@Test
	void aFreshAttemptAfterAFailureDiscriminatesAgain() {
		payments.register(new NewPayment(new BookingRef(9809L), "pi_reattempt", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_reattempt", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9809L));
		payments.markUnrecordedRefundFailed("pi_reattempt", "re_first_race");

		payments.markRefundAttempted(new BookingRef(9809L));

		assertTrue(payments.markUnrecordedRefundFailed("pi_reattempt", "re_second_race"),
				"the outbox re-drive is a new attempt, so its own racing failure must land too");
		assertEquals("re_second_race", jdbc.sql("SELECT failed_refund_id FROM payment "
						+ "WHERE payment_intent_id = 'pi_reattempt'").query(String.class).single());
		assertFalse(payments.markRefunded(new BookingRef(9809L), 4500L, "re_second_race"),
				"and the second corpse is blocked from being recorded, exactly like the first");
	}

	@Test
	void clearingTheAttemptStopsTheByIntentArm() {
		payments.register(new NewPayment(new BookingRef(9810L), "pi_refused", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_refused", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9810L));

		payments.clearRefundAttempt(new BookingRef(9810L));

		assertFalse(payments.markUnrecordedRefundFailed("pi_refused", "re_someone_elses"),
				"a refund call that ended without leaving one of ours in flight stops vouching for later refunds");
	}

	@Test
	void aManualGatewayRefundFailureMovesNothing() {
		payments.register(new NewPayment(new BookingRef(9804L), "pi_manual", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_manual", PaymentStatus.SUCCEEDED);

		assertFalse(payments.markUnrecordedRefundFailed("pi_manual", "re_by_hand"),
				"no attempt on record means this refund is not ours — the platform owes nothing");

		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM payment WHERE payment_intent_id = 'pi_manual' "
						+ "AND refund_failed_at IS NOT NULL").query(Integer.class).single(),
				"and it must not appear on the list of bookings owed a refund");
	}

	@Test
	void aLateFailureCannotUnrecordARefundAlreadyWrittenDown() {
		payments.register(new NewPayment(new BookingRef(9805L), "pi_written", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_written", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9805L));
		payments.markRefunded(new BookingRef(9805L), 4500L, "re_written");

		assertFalse(payments.markUnrecordedRefundFailed("pi_written", "re_other"),
				"the by-intent arm covers the un-written window only; a recorded refund is matched by id");
		assertEquals(4500L, payments.findRefundState(new BookingRef(9805L)).orElseThrow().refundedMinor());
	}

	@Test
	void aSucceedingRetryClearsTheOwedFlag() {
		payments.register(new NewPayment(new BookingRef(9702L), "pi_retried", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_retried", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9702L), 4500L, "re_died_once");
		payments.markRefundFailed("re_died_once");

		assertTrue(payments.markRefunded(new BookingRef(9702L), 4500L, "re_worked"),
				"a fresh refund id is not the corpse, so the retry records normally");

		assertEquals(1, jdbc.sql("""
				SELECT COUNT(*) FROM payment
				WHERE payment_intent_id = 'pi_retried' AND refund_failed_at IS NULL
				  AND failed_refund_id = 're_died_once'
				""").query(Integer.class).single(),
				"owed-now is cleared by the retry that worked, while the id of what died is kept");
	}
}
