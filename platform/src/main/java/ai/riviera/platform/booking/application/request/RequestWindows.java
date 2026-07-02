package ai.riviera.platform.booking.application.request;

import java.time.Duration;

/**
 * The two Request-to-Book time windows (issue #98), as a plain application-layer value — the
 * adapter binds them from configuration ({@code booking.request.*}, see
 * {@code RequestProperties}/{@code BookingRequestConfig}) so this layer holds no configuration
 * type, mirroring how the abandoned sweep receives its TTL.
 *
 * <ul>
 * <li>{@code expiryWindow} — how long a venue has to accept/decline before the request expires;
 *     the effective deadline is additionally capped at the evening-before cutoff (invariant #4).</li>
 * <li>{@code payWindow} — how long the guest has to pay after accept, measured from
 *     {@code accepted_at} (never {@code created_at} — the instant-book TTL clock would sweep an
 *     accepted request immediately).</li>
 * </ul>
 */
public record RequestWindows(Duration expiryWindow, Duration payWindow) {
}
