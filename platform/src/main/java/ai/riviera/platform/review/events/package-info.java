/**
 * Published <strong>events</strong> of the {@code review} module (invariant #11) — {@link ReviewsChanged},
 * the one fact this module announces: a venue's review set moved, so its stored aggregate is stale.
 * Id-based, immutable payload; the recomputed numbers deliberately do not ride it (the listener
 * queries {@code review::api} for them). Its subscriber module is granted {@code review::events}
 * plus {@code review::vocabulary} for the ids the payload carries, never a command surface.
 */
@org.springframework.modulith.NamedInterface("events")
package ai.riviera.platform.review.events;
