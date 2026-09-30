package ai.riviera.platform.review;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.LockOrderRace;
import ai.riviera.platform.PausingPorts;
import ai.riviera.platform.ReviewFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.review.application.ReviewLifecycle;
import ai.riviera.platform.review.application.ReviewModeration;
import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.ModerationOutcome;
import ai.riviera.platform.review.vocabulary.ReviewRef;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * An admin takedown that lands between an author's amend read and its write wins (#1308): the edit writes nothing
 * to the hidden row, the delete leaves it in place, and both answer {@code Hidden}.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, PausingPorts.class})
@SpringBootTest
class ReviewAmendVsTakedownIT {

	@Autowired
	ReviewLifecycle lifecycle;
	@Autowired
	ReviewModeration moderation;
	@Autowired
	JdbcClient jdbc;

	private ReviewFixtures fixtures;
	private String code;
	private long review;

	@BeforeEach
	void seed() {
		fixtures = new ReviewFixtures(jdbc);
		long venue = fixtures.venue("Amend vs takedown " + System.nanoTime());
		code = fixtures.completedBooking(venue, Instant.now().minus(1, ChronoUnit.DAYS));
		review = fixtures.review(code, 5, "Lovely", "Ana");
	}

	@Test
	void anEditReadBeforeATakedownWritesNothingToTheHiddenReview() throws Exception {
		LockOrderRace.Outcome<AmendOutcome, ModerationOutcome> outcome = takedownAfterTheAmendsRead(
				() -> lifecycle.edit(code, new ReviewSubmission(1, "Unseen by the admin", "Ana")));

		assertThat(outcome.raced()).isEqualTo(new ModerationOutcome.Applied());
		assertThat(outcome.held()).isEqualTo(new AmendOutcome.Hidden());
		assertThat(jdbc.sql("SELECT comment FROM review WHERE id = :id").param("id", review).query(String.class)
				.single()).as("a later unhide publishes what the admin saw").isEqualTo("Lovely");
	}

	@Test
	void aDeleteReadBeforeATakedownLeavesTheTakedownInPlace() throws Exception {
		LockOrderRace.Outcome<AmendOutcome, ModerationOutcome> outcome = takedownAfterTheAmendsRead(
				() -> lifecycle.delete(code));

		assertThat(outcome.held()).isEqualTo(new AmendOutcome.Hidden());
		assertThat(jdbc.sql("SELECT hidden_at IS NOT NULL FROM review WHERE id = :id").param("id", review)
				.query(Boolean.class).optional()).as("the slot stays taken, so no fresh review replaces it")
				.contains(true);
	}

	private LockOrderRace.Outcome<AmendOutcome, ModerationOutcome> takedownAfterTheAmendsRead(
			java.util.concurrent.Callable<AmendOutcome> amend) throws Exception {
		BookingRef booking = new BookingRef(fixtures.bookingIdOf(code));
		return LockOrderRace.race(jdbc, "findFor", args -> booking.equals(args[0]), amend,
				() -> moderation.hide(new ReviewRef(review)));
	}
}
