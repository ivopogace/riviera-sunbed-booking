package ai.riviera.platform.booking.application.in;

import java.util.Optional;

/**
 * The view-a-booking use case (U6, issue #11) — the inbound port the web adapter calls to render a
 * booking by its {@code code} (the bearer credential, invariant #7) together with the server-computed
 * cancellation/refund terms (invariant #10). Internal to {@code booking} ({@code application.in}),
 * not cross-module {@code api/} — the only caller is this module's REST adapter. (#50 builds on the
 * same endpoint.)
 */
public interface ViewBooking {

	/** The booking and its refund terms for {@code code}, or empty if no booking has that code. */
	Optional<BookingDetail> byCode(String code);
}
