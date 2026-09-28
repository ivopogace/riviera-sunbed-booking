package ai.riviera.platform.booking.events;

import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * A pending stay request ended {@code DECLINED} whole (#1267), published once by the guarded
 * transition that moved its stretches, in that transaction; nothing was held, so nothing is released
 * (ADR-0025). Its stretches publish no {@link BookingRequestDeclined}. Id-based: {@code notification},
 * the sole subscriber, reads the code at send time (invariant #7).
 */
public record StayRequestDeclined(StayId stayId, DeclineReason reason) {
}
