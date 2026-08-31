package ai.riviera.platform.review.spi;

import java.util.Optional;

import ai.riviera.platform.review.vocabulary.CompletedStay;

/**
 * The facts the {@code review} module lacks when deciding whether a stay may be rated: whether a
 * booking answers to a code at all, and — if it was checked in — which venue it was at and when.
 * Consulted at submit and at view time, so a guest who was just checked in can review immediately;
 * review keeps no projection of booking state.
 *
 * <p><strong>Driven (SPI) port, dependency-inverted (invariant #11).</strong> Declared here, in the
 * <em>consumer</em>'s {@code spi} named interface, and <em>implemented by the {@code booking}
 * module</em> (the sole owner of the {@code booking} table). The natural call direction
 * ({@code review} asking {@code booking::api}) would close a Modulith cycle, since {@code booking}
 * depends on {@code venue} and {@code venue} listens to this module; inverting it keeps
 * {@code review}'s grants at {@code shared} alone. Rationale: ADR-0015.
 *
 * <p>The port answers only <em>facts</em>: the review window, the one-per-booking rule and the
 * eligibility verdict all stay in {@code review}. It never exposes {@code booking}'s
 * {@code BookingStatus} — the presence of a {@link CompletedStay} <em>is</em> the completed fact.
 */
public interface CompletedStays {

	/**
	 * The completed-stay facts behind {@code bookingCode}, or empty unless a booking answers to that
	 * code <strong>and</strong> has been checked in.
	 *
	 * @param bookingCode the bearer credential the guest presents (invariant #7) — never logged
	 */
	Optional<CompletedStay> byCode(String bookingCode);

	/**
	 * Whether any booking answers to {@code bookingCode}, whatever its status.
	 *
	 * <p>Separate from {@link #byCode} because review must tell "no such booking" from "that stay was
	 * never checked in" — the two produce different answers on the code-gated surface (a 404 against a
	 * 409), and neither can be read off an empty {@link #byCode}. Consulted only once {@link #byCode}
	 * has come back empty.
	 */
	boolean existsByCode(String bookingCode);
}
