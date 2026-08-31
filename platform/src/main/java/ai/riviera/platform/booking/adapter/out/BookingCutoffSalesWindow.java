package ai.riviera.platform.booking.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.venue.spi.SalesWindow;

/**
 * Answers {@link SalesWindow} by delegating to {@link BookingCutoff}, so the browse's open/closed
 * verdict and the reserve path's fence are the same rule with one home (invariant #4). The
 * implementing side of a dependency-inverted driven port declared in {@code venue.spi} — the
 * compile edge stays {@code booking → venue}, the runtime call goes the other way, exactly the
 * {@code BookingPresence} shape.
 */
@Component
class BookingCutoffSalesWindow implements SalesWindow {

	private final BookingCutoff cutoff;

	BookingCutoffSalesWindow(BookingCutoff cutoff) {
		this.cutoff = cutoff;
	}

	@Override
	public boolean isOpen(LocalTime salesClose, LocalDate bookingDate, Instant now) {
		return cutoff.isBookable(salesClose, bookingDate, now);
	}
}
