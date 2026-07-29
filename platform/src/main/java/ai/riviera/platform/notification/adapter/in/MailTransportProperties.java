package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The SMTP relay's per-socket-operation budget, as <em>one</em> bound and validated knob (#410 Part 2).
 *
 * <p><strong>One knob, three consumers.</strong> {@code application-mailer.properties} interpolates it
 * into all three {@code spring.mail.properties.mail.smtp.*} timeouts, and
 * {@link ai.riviera.platform.notification.application.MailTransportBudget} derives both mail pools'
 * shutdown drain window from it. Before #410 the three relay timeouts were literals in the properties
 * file and the drain was a separate literal in two Java classes — four copies of what is really one
 * decision, and they disagreed: 5s of drain against a 10s socket budget, so the drain gave up while a
 * legitimate send was still running. Interpolating rather than restating is what makes the relationship
 * hold by construction; {@code MailTransportPropertiesTest} resolves all three keys through the
 * environment so a re-hardcoded literal cannot pass unnoticed.
 *
 * <p><strong>Millis rather than a {@code Duration}, deliberately.</strong> The value is interpolated
 * <em>textually</em> into Jakarta Mail's properties, which expect a plain millisecond number; a
 * {@code Duration}-typed knob would render as {@code PT10S} there and the transport would fall back to
 * its infinite default. This is the one place in the codebase where a timeout is not a {@code Duration}
 * (contrast #426's seven), and that is why — the properties file is a consumer, not just the source.
 *
 * <p><strong>Both ends are guarded, and neither bound is decoration.</strong> A non-positive value
 * restores exactly what #368 closed: Jakarta Mail's timeouts are <em>infinite</em> when unset or
 * non-positive, long enough for a degraded relay to pin a sending thread forever — and it would boot
 * cleanly. The ceiling closes the hole from the other side: the drain window is derived from this value,
 * and a drain longer than the platform's SIGTERM→SIGKILL grace means the process is killed mid-shutdown
 * instead of closing Hikari and the web layer in order, which is worse than giving up. So the ceiling is
 * the drain budget, and the shipped 10s sits at it: at that value the drain exactly fills what the
 * shutdown may spend on mail, which is the most it should ever be allowed.
 *
 * <p>The guard is a compact constructor rather than {@code @Validated} + {@code @Min} for the same
 * reason as {@link RegistryMailProperties}: Boot validates {@code @ConfigurationProperties} only when a
 * JSR-303 implementation is on the classpath and there is none (#97 declined
 * {@code spring-boot-starter-validation} deliberately, in favour of explicit checks in records — the
 * house idiom, {@code riviera-java-conventions} §2/§6b). An annotation here would bind and validate
 * nothing.
 *
 * @param socketTimeoutMs the per-operation budget in milliseconds, shipped as #368's 10s so this slice
 *        makes the value tunable rather than different; retuning it against a real relay is #370's, which
 *        is the first point real latency data exists
 */
@ConfigurationProperties("riviera.notification.mail")
record MailTransportProperties(@DefaultValue("10000") int socketTimeoutMs) {

	/**
	 * The most the shutdown drain may spend, and therefore this knob's ceiling — the drain is derived
	 * from it one-to-one. Render sends SIGTERM and kills the process about 30 seconds later, and the mail
	 * drain is only one phase of context close, so 10s leaves the rest of the shutdown room to finish.
	 * (The 30s is Render's documented default rather than a repo-recorded fact; if the platform or its
	 * grace changes, this constant is the one line to correct.)
	 */
	static final int SHUTDOWN_BUDGET_MS = 10_000;

	MailTransportProperties {
		if (socketTimeoutMs <= 0 || socketTimeoutMs > SHUTDOWN_BUDGET_MS) {
			throw new IllegalArgumentException(
					"riviera.notification.mail.socket-timeout-ms must be between 1 and "
							+ SHUTDOWN_BUDGET_MS + ", but was " + socketTimeoutMs
							+ "; it is both the relay's per-operation budget and the pools' shutdown drain "
							+ "window, so a non-positive value would restore Jakarta Mail's infinite "
							+ "timeouts (#368) while an oversized one would make the drain outlast the "
							+ "platform's SIGTERM grace and get the process killed mid-shutdown");
		}
	}
}
