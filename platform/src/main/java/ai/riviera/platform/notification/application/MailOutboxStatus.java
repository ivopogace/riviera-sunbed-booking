package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * What the admin console shows before anyone presses anything: the mail the registry still owes
 * (the same scoped count the resubmission computes) and whether the lever is accepting.
 *
 * @param outstanding publications this module's listeners still owe — see
 *        {@link MailOutbox#countOutstanding()} for why a completed mail can never appear here
 * @param cooldownRemaining how long until a resubmission would be accepted; {@link Duration#ZERO} when
 *        one would be accepted now
 */
public record MailOutboxStatus(int outstanding, Duration cooldownRemaining) {
}
