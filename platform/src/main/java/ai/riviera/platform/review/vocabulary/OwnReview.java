package ai.riviera.platform.review.vocabulary;

/**
 * A stored review as its own author may read it back — the stars they gave, the words they wrote,
 * and the name those words are attributed to.
 *
 * <p>{@code comment} and {@code displayName} are both {@code null} on a star-only row written
 * before display names were collected, and on a review its author's erasure has tombstoned; the
 * columns stay nullable for them. Every write since carries a {@code displayName}; {@code comment}
 * stays optional, and {@code null} there means the guest chose to write none.
 */
public record OwnReview(int stars, String comment, String displayName) {
}
