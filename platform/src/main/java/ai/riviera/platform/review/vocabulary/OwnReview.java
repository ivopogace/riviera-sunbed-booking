package ai.riviera.platform.review.vocabulary;

/**
 * A stored review as its own author may read it back — the stars they gave, the words they wrote,
 * and the name those words are attributed to.
 *
 * <p>{@code comment} and {@code displayName} are {@code null} for a star-only row (slice 1 recorded
 * some, and the columns stay nullable for them); every review written since carries both.
 */
public record OwnReview(int stars, String comment, String displayName) {
}
