package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The preview token binds each previewed claim's {@code (booking id, outcome kind)} and nothing else:
 * the same pairs match, a strict subset matches (a guest cancelled), a new booking or a changed kind
 * does not, and a move whose candidate changed still does.
 */
class PreviewTokenTest {

	private static final LocalDate DAY = LocalDate.of(2026, 9, 20);
	private static final SpotRef A1 = new SpotRef(new SetId(1), "A", 1);
	private static final SpotRef A2 = new SpotRef(new SetId(2), "A", 2);
	private static final SpotRef A3 = new SpotRef(new SetId(3), "A", 3);

	private static RemodelClaim claim(long bookingId, RemodelOutcome outcome) {
		return new RemodelClaim(new BookingId(bookingId), A1, DAY, 2000, "EUR", outcome);
	}

	@Test
	void theSamePairsMatchWhateverTheOrder() {
		List<RemodelClaim> previewed = List.of(claim(7, new RemodelOutcome.Move(A2, 0, 1)),
				claim(9, RemodelOutcome.Refund.REFUND));
		PreviewToken token = PreviewToken.of(previewed);

		assertTrue(token.covers(previewed));
		assertTrue(token.covers(List.of(previewed.get(1), previewed.get(0))));
		assertEquals(token, PreviewToken.of(List.of(previewed.get(1), previewed.get(0))));
	}

	@Test
	void aStrictSubsetMatchesButANewClaimOrAChangedKindDoesNot() {
		PreviewToken token = PreviewToken.of(List.of(claim(7, new RemodelOutcome.Move(A2, 0, 1)),
				claim(9, new RemodelOutcome.Move(A3, 0, 2))));

		assertTrue(token.covers(List.of(claim(7, new RemodelOutcome.Move(A2, 0, 1)))), "a guest cancelled");
		assertFalse(token.covers(List.of(claim(7, new RemodelOutcome.Move(A2, 0, 1)),
				claim(11, new RemodelOutcome.Move(A3, 0, 2)))), "a new claim arrived");
		assertFalse(token.covers(List.of(claim(7, RemodelOutcome.Refund.REFUND))), "a kind changed");
		assertFalse(token.covers(List.of(claim(7, new RemodelOutcome.Blocked(BlockReason.FROZEN)))));
	}

	@Test
	void aReRankedMoveStillMatchesBecauseTheCandidateIsNeverHashed() {
		PreviewToken token = PreviewToken.of(List.of(claim(7, new RemodelOutcome.Move(A2, 0, 1))));

		assertTrue(token.covers(List.of(claim(7, new RemodelOutcome.Move(A3, 0, 2)))));
	}

	@Test
	void anEmptyPreviewIsAValidTokenCoveringOnlyNothing() {
		PreviewToken empty = PreviewToken.of(List.of());

		assertTrue(empty.covers(List.of()));
		assertFalse(empty.covers(List.of(claim(7, RemodelOutcome.Refund.REFUND))));
		assertThrows(IllegalArgumentException.class, () -> new PreviewToken("garbage"));
	}

	@Test
	void theWireValueIsOpaqueAndNamesNoBookingId() {
		PreviewToken token = PreviewToken.of(List.of(claim(7001, RemodelOutcome.Refund.REFUND)));

		assertTrue(token.value().startsWith("v1."));
		assertFalse(token.value().contains("7001"));
	}
}
