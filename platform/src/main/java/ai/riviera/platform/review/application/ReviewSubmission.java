package ai.riviera.platform.review.application;

/**
 * What a guest is saying about their stay: the stars, the words, and the name to attribute them to.
 * The three travel together through every lifecycle verb that writes a review, so they are one
 * value rather than three parallel parameters.
 *
 * <p>Already validated by the time it exists — the driving adapter bounds both texts and refuses a
 * blank display name before constructing one (invariant: a {@code null} {@code comment} means the
 * guest wrote none, never that a blank one was dropped silently here).
 */
public record ReviewSubmission(int stars, String comment, String displayName) {
}
