package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.ReviewFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.CompletedStay;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code booking}'s side of the inverted eligibility port (AC-3): a stay is offered to
 * {@code review} only when it was actually checked in. Enumerating {@link BookingStatus} is the
 * point — the fence lives in SQL, so every status the {@code booking_status_check} admits is fired
 * at it rather than the one happy case, and a widened predicate cannot pass unnoticed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcCompletedStaysIT {

	/** Truncated to micros: TIMESTAMPTZ stores no finer, so a nanosecond instant would not round-trip. */
	private static final Instant CHECKED_IN =
			Instant.now().minus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);

	@Autowired
	CompletedStays stays;

	@Autowired
	JdbcClient jdbc;

	@ParameterizedTest
	@EnumSource(value = BookingStatus.class, names = "COMPLETED", mode = EnumSource.Mode.EXCLUDE)
	void yieldsNothingForAnyStatusButCompleted(BookingStatus status) {
		String code = booking(status, CHECKED_IN);

		assertThat(stays.byCode(code)).isEmpty();
		assertThat(stays.existsByCode(code)).isTrue();
	}

	@Test
	void yieldsTheStayFactsForACompletedBooking() {
		long venueId = venue();
		String code = booking(venueId, BookingStatus.COMPLETED, CHECKED_IN);

		Optional<CompletedStay> stay = stays.byCode(code);

		assertThat(stay).isPresent();
		assertThat(stay.get().venue().value()).isEqualTo(venueId);
		assertThat(stay.get().completedAt()).isEqualTo(CHECKED_IN);
		assertThat(stay.get().booking().value()).isEqualTo(bookingIdOf(code));
	}

	@Test
	void yieldsNothingForACompletedRowWithNoCheckInStamp() {
		String code = booking(BookingStatus.COMPLETED, null);

		assertThat(stays.byCode(code)).isEmpty();
	}

	@Test
	void reportsNoBookingForAnUnknownCode() {
		assertThat(stays.existsByCode("NOSUCHCODE")).isFalse();
		assertThat(stays.byCode("NOSUCHCODE")).isEmpty();
	}

	private String booking(BookingStatus status, Instant completedAt) {
		return booking(venue(), status, completedAt);
	}

	private String booking(long venueId, BookingStatus status, Instant completedAt) {
		return fixtures().booking(venueId, status.name(), completedAt);
	}

	private long venue() {
		return fixtures().venue("Completed Stays");
	}

	private long bookingIdOf(String code) {
		return fixtures().bookingIdOf(code);
	}

	private ReviewFixtures fixtures() {
		return new ReviewFixtures(jdbc);
	}

	@Test
	void aStayWithALiveStretchIsNotCompletedYet() {
		String code = stitchedStay(venue(), BookingStatus.COMPLETED, CHECKED_IN, BookingStatus.CONFIRMED, null);

		assertThat(stays.byCode(code)).as("stretch one is done, stretch two is still to come").isEmpty();
		assertThat(stays.existsByCode(code)).isTrue();
	}

	@Test
	void aResolvedStayIsItsLastCompletedStretch() {
		Instant later = CHECKED_IN.plus(2, ChronoUnit.DAYS);
		String code = stitchedStay(venue(), BookingStatus.COMPLETED, CHECKED_IN, BookingStatus.COMPLETED, later);

		Optional<CompletedStay> stay = stays.byCode(code);

		assertThat(stay).isPresent();
		assertThat(stay.get().completedAt()).isEqualTo(later);
		assertThat(stay.get().booking().value()).isEqualTo(bookingIdOf(code + "-2"));
	}

	@Test
	void aStayWhoseLastStretchWasMissedIsStillTheAttendedOne() {
		String code = stitchedStay(venue(), BookingStatus.COMPLETED, CHECKED_IN, BookingStatus.NO_SHOW, null);

		Optional<CompletedStay> stay = stays.byCode(code);

		assertThat(stay).isPresent();
		assertThat(stay.get().booking().value()).isEqualTo(bookingIdOf(code + "-1"));
	}

	@Test
	void aStretchsRowCodeIsNoCredential() {
		String code = stitchedStay(venue(), BookingStatus.COMPLETED, CHECKED_IN, BookingStatus.COMPLETED, CHECKED_IN);

		assertThat(stays.byCode(code + "-1")).isEmpty();
		assertThat(stays.existsByCode(code + "-1")).isFalse();
	}

	/** A stitched stay as stored: the stay row, stretch one on 1-2 July and stretch two on 3-4 July under {@code <code>-n} row codes. */
	private String stitchedStay(long venueId, BookingStatus first, Instant firstCompletedAt, BookingStatus second,
			Instant secondCompletedAt) {
		String code = "STAY" + System.nanoTime() % 1_000_000;
		long stay = jdbc.sql("INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:c, :v, :f, :l) RETURNING id")
				.param("c", code).param("v", venueId).param("f", LocalDate.of(2026, 7, 1)).param("l", LocalDate.of(2026, 7, 4))
				.query(Long.class).single();
		stretch(booking(venueId, first, firstCompletedAt), stay, code + "-1", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 2));
		stretch(booking(venueId, second, secondCompletedAt), stay, code + "-2", LocalDate.of(2026, 7, 3), LocalDate.of(2026, 7, 4));
		return code;
	}

	private void stretch(String bookingCode, long stay, String rowCode, LocalDate first, LocalDate last) {
		jdbc.sql("UPDATE booking SET stay_id = :stay, code = :row, booking_date = :first, last_date = :last WHERE code = :code")
				.param("stay", stay).param("row", rowCode).param("first", first).param("last", last).param("code", bookingCode)
				.update();
	}
}
