package ai.riviera.platform.booking.application;

/**
 * Generates booking codes — the unguessable bearer credential staff verify on arrival
 * (invariant #7). An outbound port so the random source is a swappable seam and the
 * orchestration depends on an interface, not {@code SecureRandom}. Implemented by
 * {@code SecureRandomBookingCodeGenerator}.
 */
public interface BookingCodeGenerator {

	/** A fresh, unguessable, non-sequential code (≥ 8 random base32 chars). */
	String next();
}
