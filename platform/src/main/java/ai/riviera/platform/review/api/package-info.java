/**
 * Published <strong>ports</strong> surface of the {@code review} module (invariant #11) — "call-me"
 * interfaces only: {@link VenueRatingSummary}, the aggregate {@code venue} re-reads when it learns
 * its review set moved, {@link ReviewEligibility}, the panel {@code booking} carries on its
 * code-gated view, and {@link ListedReviews}, the page of commented reviews {@code venue} serves on
 * its public page. The typed ids and values these ports speak in ({@code VenueRef},
 * {@code RatingSummary}, {@code ReviewPage}) live in the sibling {@code vocabulary} named interface; the inverted
 * "implement-me" port lives in {@code spi}. Split by consumer role (#94), so a listener consuming
 * the aggregate never sees the submit surface — that one stays internal to {@code application}.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.review.api;
