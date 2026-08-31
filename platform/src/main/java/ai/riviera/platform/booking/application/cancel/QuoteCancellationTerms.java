package ai.riviera.platform.booking.application.cancel;

import java.time.LocalDate;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Driving port for the pre-reserve terms read (#795): what a tourist would agree to by booking this
 * set on this date, quoted before anything is reserved. Implemented by {@link CancellationPolicy}
 * (the single home of the window rule, invariant #10); the controller depends on this seam only —
 * the {@code CreateBooking} pattern (invariant #11).
 */
public interface QuoteCancellationTerms {

	/** The terms quoted now, or empty for an unknown set (a stale map is an expected flow). */
	Optional<CancellationTerms> terms(SetId setId, LocalDate bookingDate);
}
