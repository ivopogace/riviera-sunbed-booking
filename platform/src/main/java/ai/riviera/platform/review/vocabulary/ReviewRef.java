package ai.riviera.platform.review.vocabulary;

/**
 * The {@code review} module's reference to one review (invariant #11 — a typed id at the seam).
 * Assigned when the review is claimed, so it also orders reviews by when they were written.
 */
public record ReviewRef(long value) {
}
