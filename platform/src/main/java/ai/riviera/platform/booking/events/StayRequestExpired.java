package ai.riviera.platform.booking.events;

import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * A pending stay request hit its shared response deadline undecided and the sweep expired it whole
 * (#1267): published once, by the guarded transition that moved its stretches; nothing was held
 * (ADR-0025). Its stretches publish no {@link BookingRequestExpired}. Id-based, never the code (#7).
 */
public record StayRequestExpired(StayId stayId) {
}
