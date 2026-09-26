package ai.riviera.platform.review.spi;

import java.util.Optional;

import ai.riviera.platform.review.vocabulary.CompletedStay;

/**
 * The booking facts {@code review} needs to decide whether a stay may be rated, pulled at submit and
 * view time so a just-completed stay is reviewable at once; review keeps no projection of booking
 * state. Declared here, implemented by {@code booking}: the inversion keeps {@code review} a leaf
 * (invariant #11; ADR-0015). Facts only — the window, one-per-booking and the verdict stay in
 * {@code review}, and {@code BookingStatus} never crosses: a present {@link CompletedStay} is the
 * completed fact.
 */
public interface CompletedStays {

	/**
	 * The completed-stay facts behind {@code bookingCode}, or empty unless a booking answers to it
	 * <strong>and</strong> its last service day was checked in or passed after an attended one.
	 *
	 * @param bookingCode the guest's bearer credential (invariant #7) — never logged
	 */
	Optional<CompletedStay> byCode(String bookingCode);

	/**
	 * Whether any booking answers to {@code bookingCode}, whatever its status. Consulted once
	 * {@link #byCode} is empty, to tell "no such booking" (404) from "stay not completed" (409).
	 */
	boolean existsByCode(String bookingCode);
}
