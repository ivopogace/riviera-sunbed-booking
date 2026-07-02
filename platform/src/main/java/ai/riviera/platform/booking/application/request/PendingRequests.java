package ai.riviera.platform.booking.application.request;

import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The operator's pending-requests queue (issue #98): every {@code PENDING_REQUEST} booking of
 * the venue, ordered by response deadline (most urgent first). Venue-scoped read — the
 * implementation verifies the operator owns the venue (invariant #13). Deliberately venue-wide,
 * not date-scoped: the operator must act on requests regardless of which day the staff view
 * currently shows.
 */
public interface PendingRequests {

	List<PendingRequest> forVenue(OperatorId operator, VenueId venueId);
}
