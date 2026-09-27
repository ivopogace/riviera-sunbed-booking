package ai.riviera.platform.booking.events;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * Published once per stitched stay, by the confirm that leaves none of its stretches unconfirmed;
 * {@code notification} mails the stay on it. Id-based: the code is read at send time (invariant #7).
 * The birth window and bps are the first stretch's, the day a stay is judged on (ADR-0024), frozen
 * so a sent mail stays true. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
public record StayConfirmed(StayId stayId, CancellationWindow cancellationWindowAtBirth,
		int lateCancelRefundBps) {
}
