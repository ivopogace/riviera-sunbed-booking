package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;

/** JSON view of a venue's "Booked online" count on {@code date} (CONTEXT.md); code-free (invariant #7). */
record BookedOnlineView(LocalDate date, int count) {
}
