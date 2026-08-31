/**
 * Published <strong>ports</strong> surface of the {@code review} module (invariant #11) — "call-me"
 * interfaces only: {@link VenueRatingSummary}, the aggregate {@code venue} re-reads when it learns
 * its review set moved. The typed ids and values these ports speak in ({@code VenueRef},
 * {@code RatingSummary}) live in the sibling {@code vocabulary} named interface; the inverted
 * "implement-me" port lives in {@code spi}. Split by consumer role (#94), so a listener consuming
 * the aggregate never sees the submit surface — that one stays internal to {@code application}.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.review.api;
