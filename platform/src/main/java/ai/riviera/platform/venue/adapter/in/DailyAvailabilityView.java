package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.vocabulary.DailyAvailability;

/**
 * One day on the wire for the availability-calendar read: the booking date as an ISO
 * {@code YYYY-MM-DD} string (invariant #6) and the day's free/total set count, flattened so a
 * calendar reading dozens of days at a time is not paying for a nested object per cell.
 *
 * <p>The date is rendered here rather than left to the serializer, so the format the client parses
 * is pinned by this type.
 */
record DailyAvailabilityView(String date, int free, int total) {

	static DailyAvailabilityView of(DailyAvailability day) {
		return new DailyAvailabilityView(day.date().toString(), day.sets().free(), day.sets().total());
	}
}
