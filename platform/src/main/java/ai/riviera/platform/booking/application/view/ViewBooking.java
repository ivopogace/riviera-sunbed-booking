package ai.riviera.platform.booking.application.view;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * The view-a-booking use case — the inbound port the web adapter calls to render a
 * booking by its {@code code} (the bearer credential, invariant #7) together with the server-computed
 * cancellation/refund terms (invariant #10). Internal to {@code booking}, not cross-module
 * {@code api/} — the only caller is this module's REST adapter.
 */
public interface ViewBooking {

	/**
	 * The booking and its refund terms for {@code code}, or empty if no booking has that code. {@code reader} is the
	 * session's customer account (empty for a guest): it decides only the {@code confirmationMail} disclosure.
	 */
	Optional<BookingDetail> byCode(String code, Optional<CustomerAccountId> reader);
}
