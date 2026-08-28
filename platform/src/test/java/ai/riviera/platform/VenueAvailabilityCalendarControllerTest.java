package ai.riviera.platform;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.AvailabilitySummary;
import ai.riviera.platform.venue.vocabulary.DailyAvailability;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the tourist availability-calendar read through the real filter chain — the
 * four things a test of {@code VenueCatalog} cannot prove: the window defaults land on
 * {@code Europe/Tirane} rather than UTC, an unusable window is refused before the port is called,
 * an absent venue is a {@code 404}, and the new path is public <em>without</em> loosening the
 * operator-only {@code /availability} read one segment away from it.
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}), like every other
 * web-slice test here. The real-schema counting behaviour is
 * {@code VenueAvailabilityCalendarIT}'s job.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class VenueAvailabilityCalendarControllerTest {

	private static final String CALENDAR = "/api/venues/{id}/availability-calendar";
	private static final long VENUE = 7L;

	/**
	 * Late enough on 1 November that UTC and {@code Europe/Tirane} disagree about the date: Tirane
	 * (UTC+1 in November) has already rolled over to the 2nd, so "today" is the 2nd — a UTC
	 * reading would say the 1st and fail (invariant #6).
	 */
	private static final Instant LATE_ON_THE_FIRST = Instant.parse("2026-11-01T23:30:00Z");

	@Autowired
	MockMvc mvc;

	/** Replaces the inert {@link WebSliceStubs} bean so this test can drive the payload. */
	@MockitoBean
	VenueCatalog catalog;

	@MockitoBean
	Clock clock;

	@BeforeEach
	void fixTheClock() {
		when(clock.instant()).thenReturn(LATE_ON_THE_FIRST);
		when(clock.getZone()).thenReturn(ZoneOffset.UTC);
	}

	@Test
	void servesOneFlatEntryPerDay() throws Exception {
		LocalDate first = LocalDate.of(2026, 12, 1);
		when(catalog.availabilityBetween(new VenueId(VENUE), first, first.plusDays(1)))
				.thenReturn(Optional.of(List.of(
						new DailyAvailability(first, new AvailabilitySummary(12, 30)),
						new DailyAvailability(first.plusDays(1), new AvailabilitySummary(30, 30)))));

		mvc.perform(get(CALENDAR, VENUE).param("from", "2026-12-01").param("to", "2026-12-02"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].date").value("2026-12-01"))
				.andExpect(jsonPath("$[0].free").value(12))
				.andExpect(jsonPath("$[0].total").value(30))
				.andExpect(jsonPath("$[1].date").value("2026-12-02"))
				.andExpect(jsonPath("$[1].free").value(30));
	}

	@Test
	void defaultsToTodayInTiraneForTwoWeeks() throws Exception {
		LocalDate today = LocalDate.of(2026, 11, 2);
		when(catalog.availabilityBetween(new VenueId(VENUE), today, today.plusDays(13)))
				.thenReturn(Optional.of(List.of()));

		mvc.perform(get(CALENDAR, VENUE)).andExpect(status().isOk());

		verify(catalog).availabilityBetween(new VenueId(VENUE), today, today.plusDays(13));
	}

	@Test
	void anOmittedEndDefaultsToThirteenDaysAfterTheGivenStart() throws Exception {
		LocalDate from = LocalDate.of(2027, 1, 10);
		when(catalog.availabilityBetween(new VenueId(VENUE), from, from.plusDays(13)))
				.thenReturn(Optional.of(List.of()));

		mvc.perform(get(CALENDAR, VENUE).param("from", "2027-01-10")).andExpect(status().isOk());

		verify(catalog).availabilityBetween(new VenueId(VENUE), from, from.plusDays(13));
	}

	@Test
	void rejectsAnOverwideWindow() throws Exception {
		mvc.perform(get(CALENDAR, VENUE).param("from", "2027-01-01").param("to", "2027-03-04"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(catalog, never()).availabilityBetween(any(), any(), any());
	}

	@Test
	void acceptsTheWidestLegalWindow() throws Exception {
		LocalDate from = LocalDate.of(2027, 1, 1);
		when(catalog.availabilityBetween(new VenueId(VENUE), from, from.plusDays(61)))
				.thenReturn(Optional.of(List.of()));

		mvc.perform(get(CALENDAR, VENUE).param("from", "2027-01-01").param("to", "2027-03-03"))
				.andExpect(status().isOk());
	}

	@Test
	void rejectsAnInvertedWindow() throws Exception {
		mvc.perform(get(CALENDAR, VENUE).param("from", "2027-01-10").param("to", "2027-01-09"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(catalog, never()).availabilityBetween(any(), any(), any());
	}

	@Test
	void rejectsAMalformedDate() throws Exception {
		mvc.perform(get(CALENDAR, VENUE).param("from", "10-01-2027"))
				.andExpect(status().isBadRequest());

		verify(catalog, never()).availabilityBetween(any(), any(), any());
	}

	@Test
	void absentVenueIs404() throws Exception {
		when(catalog.availabilityBetween(any(), any(), any())).thenReturn(Optional.empty());

		mvc.perform(get(CALENDAR, VENUE).param("from", "2027-02-01").param("to", "2027-02-07"))
				.andExpect(status().isNotFound());
	}

	@Test
	void isPublicAndDoesNotUngateTheOperatorRead() throws Exception {
		when(catalog.availabilityBetween(any(), any(), any())).thenReturn(Optional.of(List.of()));

		mvc.perform(get(CALENDAR, VENUE).param("from", "2027-02-01").param("to", "2027-02-07"))
				.andExpect(status().isOk());

		// One segment away and operator-only: the tourist path must not have widened the matcher.
		mvc.perform(get("/api/venues/{id}/availability", VENUE).param("date", "2027-02-01"))
				.andExpect(status().isUnauthorized());
	}
}
