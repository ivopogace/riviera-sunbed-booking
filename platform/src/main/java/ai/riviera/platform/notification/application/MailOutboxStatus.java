package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * What the admin console shows before anyone presses anything: how much mail the registry still
 * owes, and whether the lever is currently accepting.
 *
 * <p>This read is not required by the acceptance criteria — it exists because a resubmit button
 * with no count is a blind one, and the admin-console design canvas's own rule is that every screen is
 * backed by a real endpoint. It is the same scoped count the resubmission computes, so the two can
 * never disagree about what "outstanding" means.
 *
 * @param outstanding publications this module's listeners still owe — see
 *        {@link MailOutbox#countOutstanding()} for why a completed mail can never appear here
 * @param cooldownRemaining how long until a resubmission would be accepted; {@link Duration#ZERO} when
 *        one would be accepted now
 */
public record MailOutboxStatus(int outstanding, Duration cooldownRemaining) {
}
