package ai.riviera.platform.payout.application;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The race semantics of a batch status transition. The pre-read only chooses <em>which</em>
 * transition to attempt; the guarded write decides whether it happened. A write that matches no
 * row means another actor moved the batch first, and the caller must learn the batch's real
 * status — never a false {@code Marked}. The SQL guard itself is pinned by
 * {@code PayoutBatchGenerationIT}; this pins the composition.
 */
class PayoutReportServiceTest {

	private static final long BATCH_ID = 42;
	private static final VenueId VENUE = new VenueId(3);
	private static final PeriodKey PERIOD = new PeriodKey("2026-W28");

	private final PayoutBatches batches = mock(PayoutBatches.class);
	private final PayoutReportService service = new PayoutReportService(mock(PayoutLedger.class), batches);

	private static PayoutBatch batch(BatchStatus status) {
		return new PayoutBatch(BATCH_ID, VENUE, PERIOD, 9350, "EUR", status);
	}

	@Test
	void lostRaceReportsActualStatus() {
		when(batches.findById(BATCH_ID))
				.thenReturn(Optional.of(batch(BatchStatus.DRAFT)))
				.thenReturn(Optional.of(batch(BatchStatus.SETTLED)));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED)).thenReturn(Optional.empty());

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED);

		BatchStatusOutcome.IllegalTransition illegal =
				assertInstanceOf(BatchStatusOutcome.IllegalTransition.class, outcome,
						"a batch that moved under us must not report a successful mark");
		assertEquals(BatchStatus.SETTLED, illegal.from(), "reports the status the batch actually has now");
		assertEquals(BatchStatus.REPORTED, illegal.to());
	}

	@Test
	void lostRaceOnMissingBatchIsNotFound() {
		when(batches.findById(BATCH_ID))
				.thenReturn(Optional.of(batch(BatchStatus.DRAFT)))
				.thenReturn(Optional.empty());
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED)).thenReturn(Optional.empty());

		assertInstanceOf(BatchStatusOutcome.NotFound.class, service.mark(BATCH_ID, BatchStatus.REPORTED),
				"a batch that is gone is not an illegal transition");
	}

	@Test
	void markedCarriesThePersistedRow() {
		PayoutBatch persisted = new PayoutBatch(BATCH_ID, VENUE, PERIOD, 12_000, "EUR", BatchStatus.REPORTED);
		when(batches.findById(BATCH_ID)).thenReturn(Optional.of(batch(BatchStatus.DRAFT)));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED))
				.thenReturn(Optional.of(persisted));

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED);

		BatchStatusOutcome.Marked marked = assertInstanceOf(BatchStatusOutcome.Marked.class, outcome);
		assertEquals(persisted, marked.batch(), "the payload is the row the write returned, not the pre-read echo");
	}

	@Test
	void rejectsAnIllegalTransitionWithoutAttemptingTheWrite() {
		when(batches.findById(BATCH_ID)).thenReturn(Optional.of(batch(BatchStatus.DRAFT)));

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.SETTLED);

		BatchStatusOutcome.IllegalTransition illegal =
				assertInstanceOf(BatchStatusOutcome.IllegalTransition.class, outcome);
		assertEquals(BatchStatus.DRAFT, illegal.from());
		assertEquals(BatchStatus.SETTLED, illegal.to());
		verify(batches, never()).transition(anyLong(), any(), any());
	}

	@Test
	void aBatchAlreadyAtTheRequestedTargetIsReportedMarked() {
		PayoutBatch settledByTheWinner = batch(BatchStatus.REPORTED);
		when(batches.findById(BATCH_ID))
				.thenReturn(Optional.of(batch(BatchStatus.DRAFT)))
				.thenReturn(Optional.of(settledByTheWinner));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED)).thenReturn(Optional.empty());

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED);

		BatchStatusOutcome.Marked marked = assertInstanceOf(BatchStatusOutcome.Marked.class, outcome,
				"losing a race to the same target is not an error — the requested state holds");
		assertEquals(settledByTheWinner, marked.batch());
	}
}
