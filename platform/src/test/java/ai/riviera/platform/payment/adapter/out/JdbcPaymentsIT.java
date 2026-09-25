package ai.riviera.platform.payment.adapter.out;

import java.util.List;
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
		assertEquals(List.of(new BookingRef(9001L)), payments.findBookingRefsByIntent("pi_record_a"),
				"the webhook must correlate the PaymentIntent back to its booking");
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
		assertTrue(payments.findBookingRefsByIntent("pi_does_not_exist").isEmpty(),
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
		assertEquals(4500L, jdbc.sql("SELECT refunded_minor FROM payment_booking WHERE booking_ref = 9201")
				.query(Long.class).single());
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
				SELECT COUNT(*) FROM payment_booking
				WHERE booking_ref = 9701 AND refund_failed_at IS NOT NULL
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
		assertTrue(payments.markUnrecordedRefundFailed(new BookingRef(9801L), "re_racing"),
				"but the attempt is on record, so the failure is this platform's and must not be lost");

		assertEquals(1, jdbc.sql("""
				SELECT COUNT(*) FROM payment_booking b JOIN payment p ON p.id = b.payment_id
				WHERE b.booking_ref = 9801 AND b.refund_failed_at IS NOT NULL
				  AND b.failed_refund_id = 're_racing' AND p.status = 'SUCCEEDED' AND b.refunded_minor = 0
				""").query(Integer.class).single(),
				"the guest is owed again, and the booking is enumerable as owed");
	}

	@Test
	void markRefundedRefusesARefundAlreadyReportedDead() {
		payments.register(new NewPayment(new BookingRef(9802L), "pi_lost_race", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_lost_race", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9802L));
		payments.markUnrecordedRefundFailed(new BookingRef(9802L), "re_lost_race");

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
		payments.markUnrecordedRefundFailed(new BookingRef(9803L), "re_twice_raced");

		assertFalse(payments.markUnrecordedRefundFailed(new BookingRef(9803L), "re_twice_raced"),
				"Stripe re-delivers, and both refund types carry the same death — it must count once");
	}

	@Test
	void aResolvedAttemptStopsDiscriminatingForALaterManualRefund() {
		payments.register(new NewPayment(new BookingRef(9808L), "pi_stale_attempt", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_stale_attempt", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9808L));
		payments.markRefunded(new BookingRef(9808L), 4500L, "re_ours");
		payments.markRefundFailed("re_ours");

		assertFalse(payments.markUnrecordedRefundFailed(new BookingRef(9808L), "re_by_hand"),
				"our attempt is over — a later refund on this collection is not ours to own");

		assertEquals("re_ours", jdbc.sql("SELECT failed_refund_id FROM payment_booking "
						+ "WHERE booking_ref = 9808").query(String.class).single(),
				"and the trace still names the refund that actually died, which is what the runbook looks up");
	}

	@Test
	void aFreshAttemptAfterAFailureDiscriminatesAgain() {
		payments.register(new NewPayment(new BookingRef(9809L), "pi_reattempt", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_reattempt", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9809L));
		payments.markUnrecordedRefundFailed(new BookingRef(9809L), "re_first_race");

		payments.markRefundAttempted(new BookingRef(9809L));

		assertTrue(payments.markUnrecordedRefundFailed(new BookingRef(9809L), "re_second_race"),
				"the outbox re-drive is a new attempt, so its own racing failure must land too");
		assertEquals("re_second_race", jdbc.sql("SELECT failed_refund_id FROM payment_booking "
						+ "WHERE booking_ref = 9809").query(String.class).single());
		assertFalse(payments.markRefunded(new BookingRef(9809L), 4500L, "re_second_race"),
				"and the second corpse is blocked from being recorded, exactly like the first");
	}

	@Test
	void aManualGatewayRefundFailureMovesNothing() {
		payments.register(new NewPayment(new BookingRef(9804L), "pi_manual", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_manual", PaymentStatus.SUCCEEDED);

		assertFalse(payments.markUnrecordedRefundFailed(new BookingRef(9804L), "re_by_hand"),
				"no attempt on record means this refund is not ours — the platform owes nothing");

		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM payment_booking WHERE booking_ref = 9804 "
						+ "AND refund_failed_at IS NOT NULL").query(Integer.class).single(),
				"and it must not appear on the list of bookings owed a refund");
	}

	@Test
	void aLateFailureCannotUnrecordARefundAlreadyWrittenDown() {
		payments.register(new NewPayment(new BookingRef(9805L), "pi_written", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_written", PaymentStatus.SUCCEEDED);
		payments.markRefundAttempted(new BookingRef(9805L));
		payments.markRefunded(new BookingRef(9805L), 4500L, "re_written");

		assertFalse(payments.markUnrecordedRefundFailed(new BookingRef(9805L), "re_other"),
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
				SELECT COUNT(*) FROM payment_booking
				WHERE booking_ref = 9702 AND refund_failed_at IS NULL
				  AND failed_refund_id = 're_died_once'
				""").query(Integer.class).single(),
				"owed-now is cleared by the retry that worked, while the id of what died is kept");
	}

	/** One intent collecting for two bookings: A's share 4500, B's share 3000. */
	private void sharedCollection(String intentId, long bookingA, long bookingB) {
		payments.register(new NewPayment(intentId, "EUR", "cs_test_secret", List.of(
				new NewPayment.Share(new BookingRef(bookingA), 4500L),
				new NewPayment.Share(new BookingRef(bookingB), 3000L))));
		payments.markStatus(intentId, PaymentStatus.SUCCEEDED);
	}

	@Test
	void aSharedIntentIsFoundFromEveryBookingAndAnswersThemAll() {
		sharedCollection("pi_shared_find", 9951L, 9952L);

		assertEquals(Optional.of("pi_shared_find"), payments.findIntentByBookingRef(new BookingRef(9951L)));
		assertEquals(Optional.of("pi_shared_find"), payments.findIntentByBookingRef(new BookingRef(9952L)),
				"a sibling reaches the same intent — the refund and cancel paths start from the booking");
		assertEquals(List.of(new BookingRef(9951L), new BookingRef(9952L)),
				payments.findBookingRefsByIntent("pi_shared_find"),
				"the webhook confirms every booking the intent collects for, in registration order");
	}

	@Test
	void refundingOneBookingOnASharedIntentLeavesItsSiblingOutstanding() {
		sharedCollection("pi_shared_refund", 9953L, 9954L);

		assertTrue(payments.markRefunded(new BookingRef(9953L), 4500L, "re_shared_a"));

		var a = payments.findRefundState(new BookingRef(9953L)).orElseThrow();
		var b = payments.findRefundState(new BookingRef(9954L)).orElseThrow();
		assertEquals(4500L, a.refundedMinor(), "A's share is refunded");
		assertEquals(0L, b.refundedMinor(), "B's share is untouched — its guest is still owed it");
		assertEquals(PaymentStatus.PARTIALLY_REFUNDED, b.status(),
				"the intent is partly refunded: one of its two shares came back");
		assertEquals("PARTIALLY_REFUNDED", statusOf("pi_shared_refund"));

		assertTrue(payments.markRefunded(new BookingRef(9954L), 3000L, "re_shared_b"));

		assertEquals("REFUNDED", statusOf("pi_shared_refund"),
				"every share refunded in full is the whole intent refunded");
		assertEquals(3000L, payments.findRefundState(new BookingRef(9954L)).orElseThrow().refundedMinor());
	}

	@Test
	void unrecordingOneSiblingsRefundKeepsTheOthers() {
		sharedCollection("pi_shared_died", 9955L, 9956L);
		payments.markRefunded(new BookingRef(9955L), 4500L, "re_shared_died_a");
		payments.markRefunded(new BookingRef(9956L), 3000L, "re_shared_died_b");

		assertTrue(payments.markRefundFailed("re_shared_died_a"), "the failure moves the row it was recorded on");

		assertEquals(0L, payments.findRefundState(new BookingRef(9955L)).orElseThrow().refundedMinor(),
				"A is owed again");
		assertEquals(3000L, payments.findRefundState(new BookingRef(9956L)).orElseThrow().refundedMinor(),
				"B's refund stands — one sibling's failure is not the other's");
		assertEquals("PARTIALLY_REFUNDED", statusOf("pi_shared_died"),
				"the intent falls back to partly refunded, not to SUCCEEDED, while B's money is out");
		assertEquals(1L, jdbc.sql("SELECT COUNT(*) FROM payment_booking WHERE refund_failed_at IS NOT NULL "
						+ "AND booking_ref IN (9955, 9956)").query(Long.class).single(),
				"exactly one booking of the pair is enumerable as owed");

		assertTrue(payments.markRefundFailed("re_shared_died_b"));
		assertEquals("SUCCEEDED", statusOf("pi_shared_died"),
				"with nothing refunded on any share the collection stands in full again");
	}

	@Test
	void anUnrecordedFailureOnASharedIntentIsKeyedToItsBooking() {
		sharedCollection("pi_shared_race", 9957L, 9958L);
		payments.markRefunded(new BookingRef(9957L), 4500L, "re_shared_race_a");
		payments.markRefundAttempted(new BookingRef(9958L));

		assertTrue(payments.markUnrecordedRefundFailed(new BookingRef(9958L), "re_shared_race_b"),
				"B's attempt is on record and B has no refund written down, so the death is B's");
		assertFalse(payments.markUnrecordedRefundFailed(new BookingRef(9957L), "re_shared_race_x"),
				"A's refund is recorded, so a failure for A is matched by id or not at all");
		assertEquals(4500L, payments.findRefundState(new BookingRef(9957L)).orElseThrow().refundedMinor(),
				"A's recorded refund is untouched by B's racing failure");
		assertEquals("PARTIALLY_REFUNDED", statusOf("pi_shared_race"), "the intent's status does not move");
	}
}
