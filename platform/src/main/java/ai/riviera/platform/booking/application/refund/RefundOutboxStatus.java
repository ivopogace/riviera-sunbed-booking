package ai.riviera.platform.booking.application.refund;

import java.time.Duration;

/**
 * What an admin sees before pressing: how many refunds the registry still owes, and whether the
 * lever is accepting: the {@code MailOutboxStatus} shape on the money path. Same scoped count as
 * the resubmission, so the two never disagree on "outstanding".
 *
 * @param outstanding refund publications still owed ({@link RefundOutbox#countOutstanding()}: never
 *        a refund that moved money)
 * @param cooldownRemaining time until a resubmission is accepted; {@link Duration#ZERO} if now
 */
public record RefundOutboxStatus(int outstanding, Duration cooldownRemaining) {
}
