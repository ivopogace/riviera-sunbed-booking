package ai.riviera.platform.booking.application.remodel;

import java.time.Duration;

/**
 * The two remodel bounds as a plain application-layer value — the adapter binds them from
 * {@code riviera.booking.remodel.*} ({@code RemodelProperties}/{@code RemodelConfig}), so this layer
 * holds no configuration type, as {@code RequestWindows} does. Both are durations to the service
 * day's open: within {@code freezeWindow} a claim is frozen, within {@code refundNoticeFloor} it is
 * move-only, beyond it move-or-refund. The adapter guarantees {@code freezeWindow < refundNoticeFloor}.
 */
public record RemodelWindows(Duration freezeWindow, Duration refundNoticeFloor) {
}
