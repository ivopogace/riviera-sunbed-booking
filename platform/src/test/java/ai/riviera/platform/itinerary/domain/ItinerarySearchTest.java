package ai.riviera.platform.itinerary.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.itinerary.domain.ItinerarySearch.Anchoring;
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Itinerary;
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Stretch;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.StaySpan;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The stitching rule (design D7/D13): the fewest moves first, the shortest moves second (same row,
 * then closest position, then closest row, as the remodel move rule), never past the budget; an
 * anchor set starts or ends the plan when any plan through it fits the budget. Pure unit test of
 * the {@code domain} holder over fixed availability grids.
 */
class ItinerarySearchTest {

	private static final LocalDate D1 = LocalDate.of(2026, 7, 10);
	private static final StaySpan SEVEN_DAYS = new StaySpan(D1, D1.plusDays(6));
	private static final SetId A = new SetId(1);
	private static final SetId B = new SetId(2);
	private static final SetId C = new SetId(3);
	private static final SetId D = new SetId(4);

	/** Row 1 is the sea row: A1 B2 C3 along it, D sits one row back under A. */
	private static final Map<SetId, SetPlacement> ONE_ROW_AND_D_BEHIND = Map.of(
			A, new SetPlacement("A", 1, 1, 1),
			B, new SetPlacement("A", 2, 2, 1),
			C, new SetPlacement("A", 3, 3, 1),
			D, new SetPlacement("B", 1, 1, 2));

	private static List<LocalDate> days(int... offsets) {
		return java.util.Arrays.stream(offsets).mapToObj(D1::plusDays).toList();
	}

	@Test
	void stitchesTwoStretchesWithOneMove() {
		Map<SetId, List<LocalDate>> taken = Map.of(
				A, days(3, 4, 5, 6),
				B, days(0, 1, 2));
		Optional<Itinerary> plan = ItinerarySearch.plan(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND, taken, 3);
		assertEquals(Optional.of(new Itinerary(List.of(
				new Stretch(A, D1, D1.plusDays(2)),
				new Stretch(B, D1.plusDays(3), D1.plusDays(6))))), plan);
		assertEquals(1, plan.orElseThrow().moves());
	}

	@Test
	void aSetFreeEveryDayIsAPlanWithNoMove() {
		Optional<Itinerary> plan = ItinerarySearch.plan(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND,
				Map.of(A, days(1)), 3);
		assertEquals(Optional.of(new Itinerary(List.of(new Stretch(B, D1, D1.plusDays(6))))), plan);
	}

	@Test
	void noPlanWhenADayHasNoFreeSet() {
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(3), B, days(3));
		assertEquals(Optional.empty(), ItinerarySearch.plan(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND, taken, 3));
	}

	@Test
	void noPlanWithoutAnySet() {
		assertEquals(Optional.empty(), ItinerarySearch.plan(SEVEN_DAYS, List.of(), Map.of(), Map.of(), 3));
	}

	@Test
	void coverageAboveTheBudgetIsNoPlan() {
		// A free on even days, B on odd days: covering 7 days alternates 6 times.
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(1, 3, 5), B, days(0, 2, 4, 6));
		assertEquals(Optional.empty(), ItinerarySearch.plan(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND, taken, 3));
		Optional<Itinerary> plan = ItinerarySearch.plan(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND, taken, 6);
		assertEquals(6, plan.orElseThrow().moves());
	}

	@Test
	void fewerMovesBeatsAShorterMove() {
		// A covers days 0-2; then either B (adjacent, but taken day 5 so C is needed after) or D (a row back, free to the end).
		Map<SetId, List<LocalDate>> taken = Map.of(
				A, days(3, 4, 5, 6),
				B, days(0, 1, 2, 5, 6),
				C, days(0, 1, 2, 3, 4),
				D, days(0, 1, 2));
		Optional<Itinerary> plan = ItinerarySearch.plan(SEVEN_DAYS, List.of(A, B, C, D), ONE_ROW_AND_D_BEHIND, taken, 3);
		assertEquals(List.of(new Stretch(A, D1, D1.plusDays(2)), new Stretch(D, D1.plusDays(3), D1.plusDays(6))),
				plan.orElseThrow().stretches());
	}

	@Test
	void aTieOnMovesIsBrokenByDistanceSameRowFirst() {
		// After A (days 0-2), both C (same row, two along) and D (one row back, same position) cover days 3-6.
		Map<SetId, List<LocalDate>> taken = Map.of(
				A, days(3, 4, 5, 6),
				C, days(0, 1, 2),
				D, days(0, 1, 2));
		Optional<Itinerary> plan = ItinerarySearch.plan(SEVEN_DAYS, List.of(A, C, D), ONE_ROW_AND_D_BEHIND, taken, 3);
		assertEquals(C, plan.orElseThrow().stretches().get(1).setId());
	}

	@Test
	void thenTheClosestPositionAlongTheRow() {
		Map<SetId, List<LocalDate>> taken = Map.of(
				A, days(3, 4, 5, 6),
				B, days(0, 1, 2),
				C, days(0, 1, 2));
		Optional<Itinerary> plan = ItinerarySearch.plan(SEVEN_DAYS, List.of(A, B, C), ONE_ROW_AND_D_BEHIND, taken, 3);
		assertEquals(B, plan.orElseThrow().stretches().get(1).setId());
	}

	@Test
	void withoutPlacementsOnlyTheMoveCountDecides() {
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(3, 4, 5, 6), C, days(0, 1, 2), D, days(0, 1, 2));
		Optional<Itinerary> plan = ItinerarySearch.plan(SEVEN_DAYS, List.of(A, C, D), Map.of(), taken, 3);
		assertEquals(1, plan.orElseThrow().moves());
	}

	@Test
	void anAnchorFreeOnTheFirstDaysStartsThePlan() {
		// Unanchored best: B alone (0 moves). Anchored on A (free days 0-2 only): A then B (1 move).
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(3, 4, 5, 6));
		ItinerarySearch.Anchored anchored = ItinerarySearch.planAround(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND,
				taken, 3, A);
		assertEquals(Anchoring.START, anchored.anchoring());
		assertEquals(List.of(new Stretch(A, D1, D1.plusDays(2)), new Stretch(B, D1.plusDays(3), D1.plusDays(6))),
				anchored.itinerary().orElseThrow().stretches());
	}

	@Test
	void anAnchorFreeOnTheLastDaysEndsThePlan() {
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(0, 1, 2, 3));
		ItinerarySearch.Anchored anchored = ItinerarySearch.planAround(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND,
				taken, 3, A);
		assertEquals(Anchoring.END, anchored.anchoring());
		assertEquals(List.of(new Stretch(B, D1, D1.plusDays(3)), new Stretch(A, D1.plusDays(4), D1.plusDays(6))),
				anchored.itinerary().orElseThrow().stretches());
	}

	@Test
	void anAnchorFreeEveryDayIsTheWholePlan() {
		ItinerarySearch.Anchored anchored = ItinerarySearch.planAround(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND,
				Map.of(), 3, A);
		assertEquals(Anchoring.START, anchored.anchoring());
		assertEquals(List.of(new Stretch(A, D1, D1.plusDays(6))), anchored.itinerary().orElseThrow().stretches());
	}

	@Test
	void anAnchorThatFitsNoPlanFallsBackUnanchored() {
		// A is free only on day 3, so no plan within the budget starts or ends on it.
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(0, 1, 2, 4, 5, 6));
		ItinerarySearch.Anchored anchored = ItinerarySearch.planAround(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND,
				taken, 3, A);
		assertEquals(Anchoring.UNANCHORABLE, anchored.anchoring());
		assertEquals(List.of(new Stretch(B, D1, D1.plusDays(6))), anchored.itinerary().orElseThrow().stretches());
	}

	@Test
	void anAnchoredPlanWinsOverAnUnanchoredOneWithFewerMoves() {
		// B alone covers the stay; anchored on A (free days 0-1 only) the plan is A then B.
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(2, 3, 4, 5, 6));
		ItinerarySearch.Anchored anchored = ItinerarySearch.planAround(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND,
				taken, 3, A);
		assertEquals(Anchoring.START, anchored.anchoring());
		assertEquals(1, anchored.itinerary().orElseThrow().moves());
	}

	@Test
	void noPlanAtAllIsUnanchoredAndEmpty() {
		Map<SetId, List<LocalDate>> taken = Map.of(A, days(3), B, days(3));
		ItinerarySearch.Anchored anchored = ItinerarySearch.planAround(SEVEN_DAYS, List.of(A, B), ONE_ROW_AND_D_BEHIND,
				taken, 3, A);
		assertEquals(Anchoring.NONE, anchored.anchoring());
		assertTrue(anchored.itinerary().isEmpty());
	}

	@Test
	void aOneDaySpanIsOneStretch() {
		Optional<Itinerary> plan = ItinerarySearch.plan(StaySpan.oneDay(D1), List.of(A, B), ONE_ROW_AND_D_BEHIND,
				Map.of(A, days(0)), 3);
		assertEquals(Optional.of(new Itinerary(List.of(new Stretch(B, D1, D1)))), plan);
	}
}
