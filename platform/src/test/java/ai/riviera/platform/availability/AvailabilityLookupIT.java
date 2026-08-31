package ai.riviera.platform.availability;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.spi.SetAvailabilityLookup;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the date-aware availability lookup behind the beach map, the owner's daily view and the
 * tourist availability calendar: a set with
 * a {@code set_availability} row for a date is taken on that date and free on another; a set
 * with no row is free; any state ({@code BOOKED_ONLINE} / {@code STAFF_MARKED}) counts as taken;
 * an empty input is handled without a query. This is the read side of the dependency-inverted
 * {@link SetAvailabilityLookup} port (declared in {@code venue.spi}, implemented by
 * {@code availability}). Real Postgres + seed via Testcontainers. Each test isolates on a distinct
 * date — or, for the ranged reads whose result depends on days they did not seed, a distinct set —
 * so methods stay independent (the context/DB is shared).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AvailabilityLookupIT {

	@Autowired
	SetAvailabilityLookup lookup;

	@Autowired
	JdbcClient jdbc;

	private List<SetId> firstThreeOnlineSets() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 3")
				.query(Long.class).list().stream().map(SetId::new).toList();
	}

	/**
	 * A set trio no other test in this class touches. The range read is the only method here whose
	 * result depends on days it was not itself asked to seed, so it seeds its own sets rather than
	 * sharing the first three.
	 */
	private List<SetId> calendarSets() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id OFFSET 3 LIMIT 3")
				.query(Long.class).list().stream().map(SetId::new).toList();
	}

	/**
	 * A set no other test in this class touches, for the other ranged-predicate method: like the
	 * range read, {@code anyClaimsFrom} answers over {@code booking_date >= :from}, so a sibling's
	 * hold on a later day would decide its result.
	 */
	private SetId claimProbeSet() {
		return new SetId(jdbc.sql(
				"SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id OFFSET 6 LIMIT 1")
				.query(Long.class).single());
	}

	private void mark(SetId set, LocalDate date, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:id, :date, :state)")
				.param("id", set.value()).param("date", date).param("state", state)
				.update();
	}

	@Test
	void bookedSetIsTakenOnItsDateAndFreeOnAnother() {
		List<SetId> sets = firstThreeOnlineSets();
		SetId booked = sets.getFirst();
		LocalDate date = LocalDate.of(2026, 11, 1);
		LocalDate otherDate = LocalDate.of(2026, 11, 2);
		mark(booked, date, "BOOKED_ONLINE");

		assertTrue(lookup.takenOn(sets, date).contains(booked), "booked for D ⇒ taken on D");
		assertFalse(lookup.takenOn(sets, otherDate).contains(booked), "free on a different date");
	}

	@Test
	void unbookedSetsAreAbsentFromTheResult() {
		List<SetId> sets = firstThreeOnlineSets();
		LocalDate date = LocalDate.of(2026, 11, 3);

		assertEquals(Set.of(), lookup.takenOn(sets, date), "no rows ⇒ nothing taken (all free)");
	}

	@Test
	void staffMarkedAlsoCountsAsTaken() {
		List<SetId> sets = firstThreeOnlineSets();
		SetId blocked = sets.get(1);
		LocalDate date = LocalDate.of(2026, 11, 4);
		mark(blocked, date, "STAFF_MARKED");

		assertTrue(lookup.takenOn(sets, date).contains(blocked), "any availability row ⇒ taken");
	}

	@Test
	void emptyInputYieldsEmptyResult() {
		assertEquals(Set.of(), lookup.takenOn(List.of(), LocalDate.of(2026, 11, 5)));
	}

	@Test
	void statesOnReportsPerSetState() {
		List<SetId> sets = firstThreeOnlineSets();
		SetId online = sets.get(0);
		SetId marked = sets.get(1);
		LocalDate date = LocalDate.of(2026, 11, 6);
		mark(online, date, "BOOKED_ONLINE");
		mark(marked, date, "STAFF_MARKED");

		Map<SetId, String> states = lookup.statesOn(sets, date);

		assertEquals(Map.of(online, "BOOKED_ONLINE", marked, "STAFF_MARKED"), states,
				"held sets carry their state; the free third set is absent");
	}

	@Test
	void statesOnIsScopedToTheAskedDateAndSets() {
		List<SetId> sets = firstThreeOnlineSets();
		SetId held = sets.getFirst();
		LocalDate date = LocalDate.of(2026, 11, 7);
		mark(held, date, "BOOKED_ONLINE");
		mark(sets.get(2), LocalDate.of(2026, 11, 8), "STAFF_MARKED");

		assertEquals(Map.of(held, "BOOKED_ONLINE"), lookup.statesOn(sets, date),
				"another date's hold never leaks into the asked day");
		assertEquals(Map.of(), lookup.statesOn(List.of(sets.get(1)), date),
				"a set outside the asked list is not reported");
	}

	@Test
	void anyClaimsFromCountsOnlyHoldsOnOrAfterTheCutoff() {
		SetId held = claimProbeSet();
		LocalDate cutoff = LocalDate.of(2026, 11, 20);
		mark(held, cutoff.minusDays(1), "STAFF_MARKED");

		assertFalse(lookup.anyClaimsFrom(List.of(held), cutoff),
				"a hold whose day has passed strands nobody, so it must not block a reposition");

		mark(held, cutoff, "BOOKED_ONLINE");

		assertTrue(lookup.anyClaimsFrom(List.of(held), cutoff),
				"the cutoff day itself still counts — inclusive, not strictly after");
	}

	@Test
	void anyClaimsFromEmptyInputYieldsFalseWithoutAQuery() {
		assertFalse(lookup.anyClaimsFrom(List.of(), LocalDate.of(2026, 11, 20)));
	}

	@Test
	void statesOnEmptyInputYieldsEmptyResultWithoutAQuery() {
		assertEquals(Map.of(), lookup.statesOn(List.of(), LocalDate.of(2026, 11, 9)));
	}

	@Test
	void takenCountsBetweenCountsHoldsPerDayAndOmitsUntouchedDays() {
		List<SetId> sets = calendarSets();
		LocalDate busy = LocalDate.of(2026, 11, 11);
		LocalDate quiet = LocalDate.of(2026, 11, 12);
		mark(sets.get(0), busy, "BOOKED_ONLINE");
		mark(sets.get(1), busy, "STAFF_MARKED");
		mark(sets.get(2), quiet, "BOOKED_ONLINE");

		Map<LocalDate, Integer> counts = lookup.takenCountsBetween(
				sets, LocalDate.of(2026, 11, 10), quiet);

		assertEquals(Map.of(busy, 2, quiet, 1), counts,
				"both hold states count; a day with no rows is absent, not zero-valued");
	}

	@Test
	void takenCountsBetweenIsInclusiveOfBothBoundsAndExcludesOutside() {
		List<SetId> sets = calendarSets();
		SetId held = sets.getFirst();
		LocalDate from = LocalDate.of(2026, 11, 14);
		LocalDate to = LocalDate.of(2026, 11, 15);
		mark(held, from.minusDays(1), "BOOKED_ONLINE");
		mark(held, from, "BOOKED_ONLINE");
		mark(held, to, "BOOKED_ONLINE");
		mark(held, to.plusDays(1), "BOOKED_ONLINE");

		assertEquals(Map.of(from, 1, to, 1), lookup.takenCountsBetween(sets, from, to),
				"both bounds count; the days either side never leak in");
	}

	@Test
	void takenCountsBetweenIgnoresSetsOutsideTheAskedList() {
		List<SetId> sets = calendarSets();
		LocalDate date = LocalDate.of(2026, 11, 17);
		mark(sets.get(0), date, "BOOKED_ONLINE");
		mark(sets.get(1), date, "BOOKED_ONLINE");

		assertEquals(Map.of(date, 1), lookup.takenCountsBetween(List.of(sets.get(0)), date, date),
				"only the asked set is counted");
	}

	@Test
	void takenCountsBetweenEmptyInputYieldsEmptyResultWithoutAQuery() {
		assertEquals(Map.of(), lookup.takenCountsBetween(
				List.of(), LocalDate.of(2026, 11, 10), LocalDate.of(2026, 11, 18)));
	}
}
