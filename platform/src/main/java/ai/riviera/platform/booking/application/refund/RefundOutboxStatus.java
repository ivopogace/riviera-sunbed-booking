package ai.riviera.platform.booking.application.refund;

import java.time.Duration;

/**
 * What an admin sees before pressing anything: how many refunds the registry still owes, and
 * whether the lever is currently accepting — the {@code MailOutboxStatus} shape on the money path.
 *
 * <p>It is the same scoped count the resubmission computes, so the two can never disagree about what
 * "outstanding" means.
 *
 * @param outstanding refund publications still owed — see {@link RefundOutbox#countOutstanding()} for
 *        why a refund that moved money can never appear here
 * @param cooldownRemaining how long until a resubmission would be accepted; {@link Duration#ZERO} when
 *        one would be accepted now
 */
public record RefundOutboxStatus(int outstanding, Duration cooldownRemaining) {
}
