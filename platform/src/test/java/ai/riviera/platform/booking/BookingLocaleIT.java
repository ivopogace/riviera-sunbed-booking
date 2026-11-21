package ai.riviera.platform.booking;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.CreateStayCommand;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.shared.SiteLocale;
import ai.riviera.platform.venue.vocabulary.SetId;

import static ai.riviera.platform.booking.StayFixtures.GUEST;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * The guest's language rides the booking (#1770): stored on every row the create writes, a stretch
 * carrying its stay's, and handed to {@code notification} by {@link BookingNotificationFacts}. Every
 * {@link SiteLocale} is stored, so a locale the {@code booking_locale_check} does not list fails here.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BookingLocaleIT {

	@Autowired
	CreateBooking createBooking;

	@Autowired
	CreateStay createStay;

	@Autowired
	BookingNotificationFacts facts;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Clock clock;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	@ParameterizedTest
	@EnumSource(SiteLocale.class)
	void aBookingKeepsTheLocaleItWasCreatedIn(SiteLocale locale) {
		Venue venue = venue();
		LocalDate day = firstDay(clock);

		BookingId booking = book(new CreateBookingCommand(venue.online().getFirst(), day, day, GUEST, null, locale), venue);

		assertEquals(locale, facts.notificationInfo(booking).orElseThrow().locale());
	}

	@Test
	void aBookingCreatedWithoutALocaleReadsAsEnglish() {
		Venue venue = venue();
		LocalDate day = firstDay(clock);

		BookingId booking = book(new CreateBookingCommand(venue.online().getFirst(), day, day, GUEST, null), venue);

		assertEquals(SiteLocale.EN, facts.notificationInfo(booking).orElseThrow().locale());
	}

	@Test
	void everyStretchOfAStayKeepsTheStaysLocale() {
		Venue venue = venue();
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		CreateStayCommand english = plan(a, 2, b, 2, firstDay(clock));
		CreateStayCommand albanian = new CreateStayCommand(english.stretches(), english.contact(), null, SiteLocale.SQ);

		assertInstanceOf(StayOutcome.Confirmed.class, createStay.create(albanian));

		long stay = jdbc.sql("SELECT id FROM stay WHERE venue_id = :v").param("v", venue.id()).query(Long.class).single();
		assertEquals(List.of("sq", "sq"), jdbc.sql("SELECT locale FROM booking WHERE stay_id = :s ORDER BY booking_date")
				.param("s", stay).query(String.class).list());
		assertEquals(SiteLocale.SQ, facts.stayConfirmationFacts(new StayId(stay)).orElseThrow().locale());
		assertEquals(SiteLocale.SQ, facts.stayCancellationFacts(new StayId(stay)).orElseThrow().locale());
	}

	private Venue venue() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		return venue;
	}

	private BookingId book(CreateBookingCommand command, Venue venue) {
		assertInstanceOf(BookingOutcome.Confirmed.class, createBooking.create(command));
		return new BookingId(jdbc.sql("SELECT id FROM booking WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single());
	}
}
