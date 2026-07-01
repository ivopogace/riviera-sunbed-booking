package ai.riviera.platform.availability.adapter.in;

import java.time.LocalDate;

/**
 * Request body for a staff mark — the calendar day to mark, an ISO {@code YYYY-MM-DD}
 * {@code LocalDate} in {@code Europe/Tirane} (invariant #6). Jackson parses the ISO string; a
 * missing/blank {@code date} is rejected as a 400 by the controller before any write.
 */
record MarkRequest(LocalDate date) {
}
