package ai.riviera.platform.review;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.ReviewFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.review.application.SubmitReview;
import ai.riviera.platform.review.domain.ReviewWindow;
import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-1 end to end through the real wiring: a checked-in stay is resolved through {@code booking}'s
 * {@code JdbcCompletedStays}, the row lands in the {@code review} table, and exactly one
 * {@link ReviewsChanged} carrying the venue ref is published in the same transaction (the registry
 * then delivers it after commit — the listener's own leg is {@code VenueRatingRecomputeIT}).
 *
 * <p>{@code @SpringBootTest} + {@code @RecordApplicationEvents}, the house shape for pinning a
 * publication at the inner hexagon ({@code BookingEventIT}), rather than
 * {@code @ApplicationModuleTest}: module isolation here would bootstrap the root composition and
 * force every other module's {@code api} port to be mocked ({@code PayoutModuleTest} carries
 * fifteen), while proving less — the point of this test is that the inverted port really answers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@RecordApplicationEvents
class ReviewSubmitFlowIT {

	@Autowired
	SubmitReview submit;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	private ReviewFixtures fixtures;

	@BeforeEach
	void setUp() {
		fixtures = new ReviewFixtures(jdbc);
	}

	@Test
	void recordsTheReviewAndAnnouncesTheVenue() {
		long venueId = fixtures.venue("Submit Flow");
		String code = fixtures.completedBooking(venueId, Instant.now().minus(1, ChronoUnit.DAYS));

		assertEquals(new SubmitOutcome.Submitted(), submit.submit(code, 4));

		assertThat(starsFor(code)).isEqualTo(4);
		List<ReviewsChanged> published = events.stream(ReviewsChanged.class).toList();
		assertThat(published).containsExactly(new ReviewsChanged(new VenueRef(venueId)));
	}

	@Test
	void refusesAndAnnouncesNothingOutsideTheWindow() {
		long venueId = fixtures.venue("Submit Flow Frozen");
		String code = fixtures.completedBooking(venueId,
				Instant.now().minus(ReviewWindow.WINDOW).minus(1, ChronoUnit.DAYS));

		assertEquals(new SubmitOutcome.WindowClosed(), submit.submit(code, 4));

		assertThat(fixtures.reviewCountFor(code)).isZero();
		assertThat(events.stream(ReviewsChanged.class).toList()).isEmpty();
	}

	@Test
	void refusesAStayThatWasNeverCheckedIn() {
		long venueId = fixtures.venue("Submit Flow Confirmed");
		String code = fixtures.booking(venueId, "CONFIRMED", null);

		assertEquals(new SubmitOutcome.NotEligible(), submit.submit(code, 4));

		assertThat(fixtures.reviewCountFor(code)).isZero();
	}

	@Test
	void refusesACodeNoBookingAnswersTo() {
		assertEquals(new SubmitOutcome.NoSuchStay(), submit.submit("NOSUCHCODE", 4));
	}

	private int starsFor(String code) {
		return jdbc.sql("SELECT stars FROM review WHERE booking_id = :id")
				.param("id", fixtures.bookingIdOf(code)).query(Integer.class).single();
	}
}
