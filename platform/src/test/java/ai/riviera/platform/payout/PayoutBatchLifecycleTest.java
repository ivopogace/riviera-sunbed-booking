package ai.riviera.platform.payout;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payout.domain.BatchStatus;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The payout-batch lifecycle (U9, issue #12): status advances strictly forward
 * {@code DRAFT → REPORTED → SETTLED}; every other transition is rejected. Pure unit test.
 */
class PayoutBatchLifecycleTest {

	@Test
	void legalForwardTransitions() {
		assertTrue(BatchStatus.DRAFT.canTransitionTo(BatchStatus.REPORTED));
		assertTrue(BatchStatus.REPORTED.canTransitionTo(BatchStatus.SETTLED));
	}

	@Test
	void rejectsSkippingAStep() {
		assertFalse(BatchStatus.DRAFT.canTransitionTo(BatchStatus.SETTLED), "cannot settle a draft directly");
	}

	@Test
	void rejectsBackwardAndSelfTransitions() {
		assertFalse(BatchStatus.REPORTED.canTransitionTo(BatchStatus.DRAFT));
		assertFalse(BatchStatus.SETTLED.canTransitionTo(BatchStatus.REPORTED));
		assertFalse(BatchStatus.DRAFT.canTransitionTo(BatchStatus.DRAFT));
		assertFalse(BatchStatus.REPORTED.canTransitionTo(BatchStatus.REPORTED));
		assertFalse(BatchStatus.SETTLED.canTransitionTo(BatchStatus.SETTLED));
	}
}
