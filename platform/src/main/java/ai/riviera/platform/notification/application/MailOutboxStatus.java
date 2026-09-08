package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * What the admin console shows before anyone presses anything: how much mail the registry still
 * owes, and whether the lever is currently accepting.
 *
 * <p>This read exists because a resubmit button with no count is a blind one, and every admin screen
 * is backed by a real endpoint rather than a drawn placeholder. It is the same scoped count the
 * resubmission computes, so the two can never disagree about what "outstanding" means.
 *
 * @param outstanding publications this module's listeners still owe — see
 *        {@link MailOutbox#countOutstanding()} for why a completed mail can never appear here
 * @param cooldownRemaining how long until a resubmission would be accepted; {@link Duration#ZERO} when
 *        one would be accepted now
 */
public record MailOutboxStatus(int outstanding, Duration cooldownRemaining) {
}
