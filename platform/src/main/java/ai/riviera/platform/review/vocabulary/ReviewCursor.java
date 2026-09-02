package ai.riviera.platform.review.vocabulary;

/**
 * Where a page of listed reviews starts: the page holds the newest reviews written
 * <em>before</em> {@code beforeId}, so a caller reads a venue's list by passing back the cursor the
 * previous page handed out ({@link ReviewPage#next()}). {@link #FIRST_PAGE} names no bound and reads
 * from the newest review. A keyset cursor, so a review written while the guest reads shifts nothing
 * they have already seen.
 */
public record ReviewCursor(long beforeId) {

	/** The page starting at the venue's newest listed review. */
	public static final ReviewCursor FIRST_PAGE = new ReviewCursor(Long.MAX_VALUE);

	/** The page of reviews older than {@code last} — what a page hands out as its {@code next}. */
	public static ReviewCursor after(ReviewRef last) {
		return new ReviewCursor(last.value());
	}
}
