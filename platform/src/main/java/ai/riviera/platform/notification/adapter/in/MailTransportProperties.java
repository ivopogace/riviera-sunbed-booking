package ai.riviera.platform.notification.adapter.in;

import ai.riviera.platform.shared.ShutdownBudget;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The SMTP relay's per-socket-operation budget, as <em>one</em> bound and validated knob.
 *
 * <p><strong>One knob, three consumers.</strong> {@code application-mailer.properties} interpolates it
 * into all three {@code spring.mail.properties.mail.smtp.*} timeouts, and
 * {@link ai.riviera.platform.notification.application.MailTransportBudget} derives both mail pools'
 * shutdown drain window from it. Interpolating rather than restating is what makes the relationship
 * hold by construction — as four separate literals they disagreed, giving 5s of drain against a 10s
 * socket budget, so the drain gave up while a legitimate send was still running.
 * {@code MailTransportPropertiesTest} resolves all three keys through the environment, so a
 * re-hardcoded literal cannot pass unnoticed.
 *
 * <p><strong>Millis rather than a {@code Duration}, deliberately.</strong> The value is interpolated
 * <em>textually</em> into Jakarta Mail's properties, which expect a plain millisecond number; a
 * {@code Duration}-typed knob would render as {@code PT10S} there and the transport would fall back to
 * its infinite default. This is the one timeout in the codebase that is not a {@code Duration}, because
 * the properties file is a consumer here, not just the source.
 *
 * <p><strong>Both ends are guarded, and neither bound is decoration.</strong> A non-positive value
 * restores Jakarta Mail's <em>infinite</em> timeouts — long enough for a degraded relay to pin a sending
 * thread forever, and it would boot cleanly. The ceiling closes the hole from the other side: the drain
 * window is derived from this value, and a drain longer than the platform's SIGTERM→SIGKILL grace means
 * the process is killed mid-shutdown instead of closing Hikari and the web layer in order. So the
 * ceiling is this pool's drain claim and the shipped value sits at it; what the whole process may spend,
 * and who else claims a share, is {@link ShutdownBudget}'s to say. A compact constructor rather than
 * {@code @Validated} + {@code @Min}, for {@link RegistryMailProperties}' reason.
 *
 * @param socketTimeoutMs the per-operation budget in milliseconds
 */
@ConfigurationProperties("riviera.notification.mail")
record MailTransportProperties(@DefaultValue("10000") int socketTimeoutMs) {

	/**
	 * The per-pool ceiling, and therefore this knob's: each mail pool may spend at most its share of the
	 * platform's SIGTERM grace, stated once in {@link ShutdownBudget} and claimed there by <em>every</em>
	 * pool that drains — including {@code booking}'s refund bulkhead, which this module neither can nor
	 * should count (invariant #11). A budget divided inside one module cannot ration a resource the whole
	 * process spends, so this record states only what <em>this</em> module's pools may each spend;
	 * {@code ShutdownDrainArchitectureTest} discovers the pools and sums their claims.
	 */
	static final int SHUTDOWN_BUDGET_MS = ShutdownBudget.MAIL_POOL_CLAIM_MS;

	MailTransportProperties {
		if (socketTimeoutMs <= 0 || socketTimeoutMs > SHUTDOWN_BUDGET_MS) {
			throw new IllegalArgumentException(
					"riviera.notification.mail.socket-timeout-ms must be between 1 and "
							+ SHUTDOWN_BUDGET_MS + ", but was " + socketTimeoutMs
							+ "; it is both the relay's per-operation budget and EACH pool's shutdown drain "
							+ "window, so a non-positive value would restore Jakarta Mail's infinite "
							+ "timeouts (#368) while an oversized one would overspend this module's share "
							+ "of the platform's SIGTERM grace — pools drain SEQUENTIALLY at context "
							+ "close, so the windows add rather than overlap and the process is killed "
							+ "mid-shutdown instead (the whole budget: ShutdownBudget)");
		}
	}
}
