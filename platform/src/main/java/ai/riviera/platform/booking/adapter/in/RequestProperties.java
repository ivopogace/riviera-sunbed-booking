package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The Request-to-Book windows (issue #98), bound from {@code booking.request.*}:
 * {@code expiry-window} — how long a venue has to respond to a pending request (default 24h;
 * the effective deadline is additionally capped at the evening-before cutoff, invariant #4) —
 * and {@code pay-window} — how long the guest has to pay after accept, from {@code accepted_at}
 * (default 12h; the guest may be asleep when the accept lands, so the instant-book 15-minute
 * TTL would be far too tight). Converted to the application-layer {@code RequestWindows} value
 * by {@code BookingRequestConfig}, so the application holds no configuration type.
 *
 * <p>The expiry sweep's cadence ({@code booking.request.sweep-interval},
 * {@code booking.request.initial-delay}) is consumed only by the {@code @Scheduled} placeholders
 * on {@code RequestSweepScheduler} — deliberately not in this record (no programmatic reader),
 * same as the abandoned sweep's cadence keys.
 */
@ConfigurationProperties("booking.request")
public record RequestProperties(Duration expiryWindow, Duration payWindow) {

	private static final Duration DEFAULT_EXPIRY_WINDOW = Duration.ofHours(24);
	private static final Duration DEFAULT_PAY_WINDOW = Duration.ofHours(12);

	public RequestProperties {
		expiryWindow = expiryWindow == null ? DEFAULT_EXPIRY_WINDOW : expiryWindow;
		payWindow = payWindow == null ? DEFAULT_PAY_WINDOW : payWindow;
	}
}
