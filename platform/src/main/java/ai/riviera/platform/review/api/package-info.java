/**
 * Published <strong>ports</strong> of the {@code review} module (invariant #11), split by consumer
 * role: {@link VenueRatingSummary} ({@code venue}'s aggregate), {@link ListedReviews}
 * ({@code venue}'s public page), {@link ReviewEligibility} ({@code booking}'s code-gated panel) and
 * {@link ReviewTombstones} ({@code booking}'s erasure reach — the one published write, a scrub).
 * Their typed ids and values live in {@code vocabulary}, the "implement-me" port in {@code spi};
 * the submit surface stays internal to {@code application}. Rationale: RESPONSIBILITIES.md §review.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.review.api;
