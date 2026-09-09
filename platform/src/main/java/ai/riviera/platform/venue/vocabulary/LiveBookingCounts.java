package ai.riviera.platform.venue.vocabulary;

/**
 * What a venue's guests are still owed from a given day on: {@code futureBookings} a guest may
 * still turn up on (confirmed or awaiting payment) and {@code pendingRequests} the venue has not yet
 * answered. Answered by {@code booking} through {@code venue.spi.BookingPresence}; which statuses
 * count is that module's call. Carried on the close-for-season response so the operator knows what
 * closing leaves standing.
 */
public record LiveBookingCounts(int futureBookings, int pendingRequests) {
}
