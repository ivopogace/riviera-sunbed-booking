package ai.riviera.platform.availability;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.api.SetAvailabilityLookup;
import ai.riviera.platform.venue.api.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the date-aware availability lookup behind the live beach map (issue #44): a set with
 * a {@code set_availability} row for a date is taken on that date and free on another; a set
 * with no row is free; any state ({@code BOOKED_ONLINE} / {@code STAFF_MARKED}) counts as taken;
 * an empty input is handled without a query. This is the read side of the dependency-inverted
 * {@link SetAvailabilityLookup} port (declared in {@code venue.api}, implemented by
 * {@code availability}). Real Postgres + seed via Testcontainers. Each test uses a distinct date
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
}
