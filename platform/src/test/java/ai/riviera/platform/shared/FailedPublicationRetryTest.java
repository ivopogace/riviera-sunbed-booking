package ai.riviera.platform.shared;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.modulith.events.core.PublicationTargetIdentifier;
import org.springframework.modulith.events.core.TargetEventPublication;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FailedPublicationRetryTest {

	private static final Instant NOW = Instant.parse("2026-10-01T12:00:00Z");

	private static final String SPINE = "payout.accrue-on-booking-confirmed";

	private static final FailedPublicationRetry.Bounds BOUNDS =
			new FailedPublicationRetry.Bounds(2, Duration.ofMinutes(5), 3);

	private static final Instant OLD = NOW.minus(Duration.ofMinutes(30));

	private final CapturingPublications publications = new CapturingPublications();

	private final FailedPublicationRetry retry = new FailedPublicationRetry(publications, BOUNDS, Set.of(SPINE),
			Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	void anOldFailedSpinePublicationIsEligible() {
		assertTrue(eligible(publication(SPINE, EventPublication.Status.FAILED, 1, OLD, null)));
	}

	@Test
	void aListenerOffTheAllowlistIsNot() {
		assertFalse(eligible(publication("notification.mail-on-booking-confirmed", EventPublication.Status.FAILED,
				1, OLD, null)));
	}

	@Test
	void aPublicationThatHasNotFailedIsNot() {
		assertFalse(eligible(publication(SPINE, EventPublication.Status.PUBLISHED, 0, OLD, null)));
		assertFalse(eligible(publication(SPINE, EventPublication.Status.PROCESSING, 1, OLD, null)));
	}

	@Test
	void aPublicationAtTheAttemptCapIsNot() {
		assertFalse(eligible(publication(SPINE, EventPublication.Status.FAILED, 3, OLD, null)));
	}

	@Test
	void aRecentlyResubmittedPublicationWaitsOutTheMinimumAge() {
		assertFalse(eligible(publication(SPINE, EventPublication.Status.FAILED, 1, OLD, NOW.minusSeconds(60))));
		assertFalse(eligible(publication(SPINE, EventPublication.Status.FAILED, 1, NOW.minusSeconds(60), null)));
	}

	@Test
	void aPublicationThatCannotNameItsListenerIsExcluded() {
		EventPublication untargeted = mock(EventPublication.class);
		when(untargeted.getStatus()).thenReturn(EventPublication.Status.FAILED);
		when(untargeted.getPublicationDate()).thenReturn(OLD);

		assertFalse(eligible(untargeted));
	}

	@Test
	void oneSweepHandsBackAtMostTheBatchSize() {
		publications.candidates.addAll(List.of(
				publication(SPINE, EventPublication.Status.FAILED, 1, OLD, null),
				publication("booking.refund-on-booking-cancelled", EventPublication.Status.FAILED, 1, OLD, null),
				publication(SPINE, EventPublication.Status.FAILED, 1, OLD, null),
				publication(SPINE, EventPublication.Status.FAILED, 1, OLD, null)));

		assertEquals(2, retry.resubmit());
		assertEquals(2, publications.accepted.size());
	}

	@Test
	void boundsRejectAnEmptyBatch() {
		assertThrows(IllegalArgumentException.class,
				() -> new FailedPublicationRetry.Bounds(0, Duration.ofMinutes(5), 3));
	}

	private boolean eligible(EventPublication publication) {
		return retry.isEligible(publication, NOW.minus(BOUNDS.minAge()));
	}

	private static TargetEventPublication publication(String listenerId, EventPublication.Status status,
			int attempts, Instant published, Instant lastResubmitted) {
		TargetEventPublication publication = mock(TargetEventPublication.class);
		when(publication.getTargetIdentifier()).thenReturn(PublicationTargetIdentifier.of(listenerId));
		when(publication.getStatus()).thenReturn(status);
		when(publication.getCompletionAttempts()).thenReturn(attempts);
		when(publication.getPublicationDate()).thenReturn(published);
		when(publication.getLastResubmissionDate()).thenReturn(lastResubmitted);
		return publication;
	}

	/** Applies the predicate once per candidate, as the registry does, and records what it accepted. */
	private static final class CapturingPublications implements IncompleteEventPublications {

		private final List<EventPublication> candidates = new ArrayList<>();

		private final List<EventPublication> accepted = new ArrayList<>();

		@Override
		public void resubmitIncompletePublications(Predicate<EventPublication> filter) {
			candidates.stream().filter(filter).forEach(accepted::add);
		}

		@Override
		public void resubmitIncompletePublicationsOlderThan(Duration duration) {
			throw new UnsupportedOperationException();
		}

		@Override
		public void resubmitIncompletePublications(ResubmissionOptions options) {
			throw new UnsupportedOperationException();
		}
	}
}
