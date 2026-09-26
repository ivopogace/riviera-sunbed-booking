package ai.riviera.platform.itinerary.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The stay-fit rule: a venue hosts a stay when one online set has no taken day in it and the
 * venue's maximum stay allows the length; otherwise the verdict carries the longest run one set is
 * free for and the maximum, so the caller can say why. Pure unit test of the {@code domain} holder.
 */
class StayFitTest {

	private static final LocalDate D1 = LocalDate.of(2026, 7, 10);
	private static final StaySpan FOUR_DAYS = new StaySpan(D1, D1.plusDays(3));
	private static final SetId S1 = new SetId(1);
	private static final SetId S2 = new SetId(2);
	private static final SetId S3 = new SetId(3);
	private static final SetId S4 = new SetId(4);

	@Test
	void oneSetFreeEveryDayIsSameSet() {
		Map<SetId, List<LocalDate>> taken = Map.of(
				S2, List.of(D1.plusDays(1)),
				S3, List.of(D1, D1.plusDays(1), D1.plusDays(2), D1.plusDays(3)),
				S4, List.of(D1.plusDays(3)));
		StayVerdict verdict = StayFit.verdict(FOUR_DAYS, List.of(S1, S2, S3, S4), taken, null);
		assertEquals(new StayVerdict(StayVerdict.Fit.SAME_SET, 1, 4, null), verdict);
	}

	@Test
	void noSetFreeEveryDayCannotHostAndNamesTheLongestRun() {
		Map<SetId, List<LocalDate>> taken = Map.of(
				S2, List.of(D1.plusDays(1)),
				S4, List.of(D1.plusDays(3)));
		StayVerdict verdict = StayFit.verdict(FOUR_DAYS, List.of(S2, S4), taken, null);
		assertEquals(new StayVerdict(StayVerdict.Fit.CANNOT_HOST, 0, 3, null), verdict);
	}

	@Test
	void aMaximumStayShorterThanTheSpanCannotHostEvenWithAFreeSet() {
		StayVerdict verdict = StayFit.verdict(FOUR_DAYS, List.of(S1), Map.of(), 2);
		assertEquals(new StayVerdict(StayVerdict.Fit.CANNOT_HOST, 1, 4, 2), verdict);
	}

	@Test
	void aMaximumStayEqualToTheSpanStillHosts() {
		StayVerdict verdict = StayFit.verdict(FOUR_DAYS, List.of(S1), Map.of(), 4);
		assertEquals(new StayVerdict(StayVerdict.Fit.SAME_SET, 1, 4, 4), verdict);
	}

	@Test
	void noOnlineSetsCannotHostWithNoRun() {
		StayVerdict verdict = StayFit.verdict(FOUR_DAYS, List.of(), Map.of(), null);
		assertEquals(new StayVerdict(StayVerdict.Fit.CANNOT_HOST, 0, 0, null), verdict);
	}

	@Test
	void takenDaysOutsideTheSpanAreIgnored() {
		Map<SetId, List<LocalDate>> taken = Map.of(S1, List.of(D1.minusDays(1), D1.plusDays(4)));
		StayVerdict verdict = StayFit.verdict(FOUR_DAYS, List.of(S1), taken, null);
		assertEquals(new StayVerdict(StayVerdict.Fit.SAME_SET, 1, 4, null), verdict);
	}

	@Test
	void oneDaySpanIsSameSetWheneverAnySetIsFree() {
		StaySpan oneDay = StaySpan.oneDay(D1);
		StayVerdict verdict = StayFit.verdict(oneDay, List.of(S1, S2), Map.of(S1, List.of(D1)), null);
		assertEquals(new StayVerdict(StayVerdict.Fit.SAME_SET, 1, 1, null), verdict);
	}
}
