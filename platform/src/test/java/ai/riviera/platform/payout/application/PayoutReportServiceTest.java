package ai.riviera.platform.payout.application;

import java.util.Optional;
import java.util.OptionalLong;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The race semantics of a batch status transition. The pre-read only chooses <em>which</em>
 * transition to attempt; the guarded write decides whether it happened. A write that matches no
 * row means another actor moved the batch first, and the caller must learn the batch's real
 * status — never a false {@code Marked}. The SQL guard itself is pinned by
 * {@code PayoutBatchGenerationIT}; this pins the composition. A {@code REPORTED} mark carries the
 * total the admin reviewed, and a batch at another total answers {@code TotalChanged} (#1320).
 */
class PayoutReportServiceTest {

	private static final long BATCH_ID = 42;
	private static final VenueId VENUE = new VenueId(3);
	private static final PeriodKey PERIOD = new PeriodKey("2026-W28");
	private static final long TOTAL = 9350;

	private final PayoutBatches batches = mock(PayoutBatches.class);
	private final PayoutLedger ledger = mock(PayoutLedger.class);
	private final PayoutReportService service = new PayoutReportService(ledger, batches);

	@Test
	void generateLocksItsPeriodBeforeItReadsTheBatchesOrTheLedger() {
		service.generate(PERIOD);

		InOrder order = inOrder(batches, ledger);
		order.verify(batches).lockPeriod(PERIOD);
		order.verify(batches).forPeriod(PERIOD);
		order.verify(ledger).netTotalsForPeriod(PERIOD);
	}

	private static PayoutBatch batch(BatchStatus status) {
		return batch(status, TOTAL);
	}

	private static PayoutBatch batch(BatchStatus status, long total) {
		return new PayoutBatch(BATCH_ID, VENUE, PERIOD, total, "EUR", status);
	}

	@Test
	void lostRaceReportsActualStatus() {
		when(batches.findById(BATCH_ID))
				.thenReturn(Optional.of(batch(BatchStatus.DRAFT)))
				.thenReturn(Optional.of(batch(BatchStatus.SETTLED)));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED, TOTAL)).thenReturn(Optional.empty());

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED, OptionalLong.of(TOTAL));

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
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED, TOTAL)).thenReturn(Optional.empty());

		assertInstanceOf(BatchStatusOutcome.NotFound.class, service.mark(BATCH_ID, BatchStatus.REPORTED, OptionalLong.of(TOTAL)),
				"a batch that is gone is not an illegal transition");
	}

	@Test
	void markedCarriesThePersistedRow() {
		PayoutBatch persisted = new PayoutBatch(BATCH_ID, VENUE, PERIOD, 12_000, "EUR", BatchStatus.REPORTED);
		when(batches.findById(BATCH_ID)).thenReturn(Optional.of(batch(BatchStatus.DRAFT)));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED, TOTAL))
				.thenReturn(Optional.of(persisted));

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED, OptionalLong.of(TOTAL));

		BatchStatusOutcome.Marked marked = assertInstanceOf(BatchStatusOutcome.Marked.class, outcome);
		assertEquals(persisted, marked.batch(), "the payload is the row the write returned, not the pre-read echo");
	}

	@Test
	void rejectsAnIllegalTransitionWithoutAttemptingTheWrite() {
		when(batches.findById(BATCH_ID)).thenReturn(Optional.of(batch(BatchStatus.DRAFT)));

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.SETTLED, OptionalLong.empty());

		BatchStatusOutcome.IllegalTransition illegal =
				assertInstanceOf(BatchStatusOutcome.IllegalTransition.class, outcome);
		assertEquals(BatchStatus.DRAFT, illegal.from());
		assertEquals(BatchStatus.SETTLED, illegal.to());
		verify(batches, never()).transition(anyLong(), any(), any(), anyLong());
	}

	@Test
	void aBatchAlreadyAtTheRequestedTargetIsReportedMarked() {
		PayoutBatch settledByTheWinner = batch(BatchStatus.REPORTED);
		when(batches.findById(BATCH_ID))
				.thenReturn(Optional.of(batch(BatchStatus.DRAFT)))
				.thenReturn(Optional.of(settledByTheWinner));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED, TOTAL)).thenReturn(Optional.empty());

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED, OptionalLong.of(TOTAL));

		BatchStatusOutcome.Marked marked = assertInstanceOf(BatchStatusOutcome.Marked.class, outcome,
				"losing a race to the same target is not an error — the requested state holds");
		assertEquals(settledByTheWinner, marked.batch());
	}

	@Test
	void aReviewedTotalTheBatchNoLongerHoldsIsTotalChanged() {
		PayoutBatch refreshed = batch(BatchStatus.DRAFT, 8000);
		when(batches.findById(BATCH_ID)).thenReturn(Optional.of(refreshed));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED, TOTAL)).thenReturn(Optional.empty());

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED, OptionalLong.of(TOTAL));

		BatchStatusOutcome.TotalChanged changed = assertInstanceOf(BatchStatusOutcome.TotalChanged.class, outcome,
				"a DRAFT refreshed since the admin's read is not an illegal transition, and is not marked");
		assertEquals(refreshed, changed.current(), "carries the batch at its current total");
	}

	@Test
	void losingToAReportAtAnotherTotalIsTotalChanged() {
		PayoutBatch reportedElsewhere = batch(BatchStatus.REPORTED, 8000);
		when(batches.findById(BATCH_ID))
				.thenReturn(Optional.of(batch(BatchStatus.DRAFT)))
				.thenReturn(Optional.of(reportedElsewhere));
		when(batches.transition(BATCH_ID, BatchStatus.DRAFT, BatchStatus.REPORTED, TOTAL)).thenReturn(Optional.empty());

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.REPORTED, OptionalLong.of(TOTAL));

		assertEquals(reportedElsewhere,
				assertInstanceOf(BatchStatusOutcome.TotalChanged.class, outcome,
						"a batch frozen at a total this admin never reviewed is not their Marked").current());
	}

	@Test
	void settlingGuardsOnTheTotalItRead() {
		PayoutBatch settled = batch(BatchStatus.SETTLED);
		when(batches.findById(BATCH_ID)).thenReturn(Optional.of(batch(BatchStatus.REPORTED)));
		when(batches.transition(BATCH_ID, BatchStatus.REPORTED, BatchStatus.SETTLED, TOTAL))
				.thenReturn(Optional.of(settled));

		BatchStatusOutcome outcome = service.mark(BATCH_ID, BatchStatus.SETTLED, OptionalLong.empty());

		assertEquals(settled, assertInstanceOf(BatchStatusOutcome.Marked.class, outcome).batch());
	}

	@Test
	void reportingWithoutAReviewedTotalIsRefusedBeforeAnyRead() {
		assertThrows(IllegalArgumentException.class,
				() -> service.mark(BATCH_ID, BatchStatus.REPORTED, OptionalLong.empty()));
		verify(batches, never()).findById(anyLong());
	}
}
