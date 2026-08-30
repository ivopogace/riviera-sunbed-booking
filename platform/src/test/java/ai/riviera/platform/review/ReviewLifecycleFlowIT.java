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
import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.application.ReviewLifecycle;
import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.domain.ReviewWindow;
import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.ReviewState;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-4 and AC-5 end to end through the real wiring: a guest rewrites and then removes their own
 * review, each write lands in the {@code review} table and announces the venue, and the window
 * fence refuses both once it has closed.
 *
 * <p>Also the both-ends check the gate exists for: the write path and the eligibility read are
 * asked the same question after the same setup, so a divergence between them fails here rather
 * than reaching a guest as a form that will not submit.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@RecordApplicationEvents
class ReviewLifecycleFlowIT {

	@Autowired
	ReviewLifecycle lifecycle;

	@Autowired
	ReviewEligibility eligibility;

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
	void anEditRewritesTheRowStampsItAndRepublishes() {
		long venueId = fixtures.venue("Lifecycle Edit");
		String code = reviewedStay(venueId, new ReviewSubmission(2, "Too windy", "Ana"));

		assertEquals(new AmendOutcome.Done(),
				lifecycle.edit(code, new ReviewSubmission(5, "Came back, much better", "Ana K")));

		assertThat(storedReview(code)).containsExactly("5", "Came back, much better", "Ana K");
		assertThat(updatedAtOf(code)).isNotNull();
		assertThat(events.stream(ReviewsChanged.class).toList())
				.containsExactly(new ReviewsChanged(new VenueRef(venueId)),
						new ReviewsChanged(new VenueRef(venueId)));
	}

	@Test
	void aDeleteRemovesTheRowAndRepublishes() {
		long venueId = fixtures.venue("Lifecycle Delete");
		String code = reviewedStay(venueId, new ReviewSubmission(4, "Lovely", "Ana"));

		assertEquals(new AmendOutcome.Done(), lifecycle.delete(code));

		assertThat(fixtures.reviewCountFor(code)).isZero();
		assertThat(events.stream(ReviewsChanged.class).count()).isEqualTo(2);
		assertEquals(ReviewState.ELIGIBLE, eligibility.stateFor(code), "the stay is reviewable again");
	}

	@Test
	void bothVerbsRefuseOnceTheWindowHasClosedAndTheReadAgrees() {
		long venueId = fixtures.venue("Lifecycle Frozen");
		String code = reviewedStay(venueId, new ReviewSubmission(3, "Fine", "Ana"));
		freezeTheWindowFor(code);

		assertEquals(new AmendOutcome.WindowClosed(),
				lifecycle.edit(code, new ReviewSubmission(1, null, "Ana")));
		assertEquals(new AmendOutcome.WindowClosed(), lifecycle.delete(code));

		assertEquals(ReviewState.WINDOW_CLOSED, eligibility.stateFor(code));
		assertThat(storedReview(code)).containsExactly("3", "Fine", "Ana");
	}

	@Test
	void amendingAStayThatCarriesNoReviewIsNoSuchReview() {
		long venueId = fixtures.venue("Lifecycle Unreviewed");
		String code = fixtures.completedBooking(venueId, Instant.now().minus(1, ChronoUnit.DAYS));

		assertEquals(new AmendOutcome.NoSuchReview(),
				lifecycle.edit(code, new ReviewSubmission(4, null, "Ana")));
		assertEquals(new AmendOutcome.NoSuchReview(), lifecycle.delete(code));
	}

	@Test
	void amendingACodeNoBookingAnswersToIsNoSuchStay() {
		assertEquals(new AmendOutcome.NoSuchStay(),
				lifecycle.edit("NOSUCHCODE", new ReviewSubmission(4, null, "Ana")));
		assertEquals(new AmendOutcome.NoSuchStay(), lifecycle.delete("NOSUCHCODE"));
	}

	private String reviewedStay(long venueId, ReviewSubmission submission) {
		String code = fixtures.completedBooking(venueId, Instant.now().minus(1, ChronoUnit.DAYS));
		assertEquals(new SubmitOutcome.Submitted(), lifecycle.submit(code, submission));
		return code;
	}

	/** Backdate the check-in past the window, so the stay is frozen without touching the clock. */
	private void freezeTheWindowFor(String code) {
		jdbc.sql("UPDATE booking SET completed_at = :at WHERE code = :code")
				.param("at", java.sql.Timestamp.from(
						Instant.now().minus(ReviewWindow.WINDOW).minus(1, ChronoUnit.DAYS)))
				.param("code", code)
				.update();
	}

	private List<String> storedReview(String code) {
		return jdbc.sql("SELECT stars, comment, display_name FROM review WHERE booking_id = :id")
				.param("id", fixtures.bookingIdOf(code))
				.query((rs, rowNum) -> List.of(String.valueOf(rs.getInt("stars")), rs.getString("comment"),
						rs.getString("display_name")))
				.single();
	}

	private Instant updatedAtOf(String code) {
		return jdbc.sql("SELECT updated_at FROM review WHERE booking_id = :id")
				.param("id", fixtures.bookingIdOf(code)).query(Instant.class).single();
	}
}
