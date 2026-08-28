package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The two Request-to-Book windows as <em>bound, validated</em> configuration.
 *
 * <p>Both degenerate values boot cleanly and present as "nothing happens". {@code expiry-window=PT0S}
 * makes {@code min(now + window, cutoff)} equal {@code now}, so every pending request is born expired
 * and no accept can ever win the {@code request_expires_at > now} guard — a Request-mode venue takes no
 * bookings at all and the queue simply always reads empty. {@code pay-window=PT0S} fails one step later
 * and looks worse to the guest: the accepted-request arm of the abandoned sweep expires bookings older
 * than {@code now.minus(payWindow)}, so the booking is cancelled and its set released in the same
 * instant the venue accepted it.
 *
 * <p><strong>Why {@code expiryWindow} has a floor but no ceiling — and why that is pinned here.</strong>
 * {@code ReserveSetService} caps the deadline at the venue's sales close on D
 * ({@code min(clock.instant().plus(expiryWindow), cutoff.salesCloseAt(...))}, invariant #4),
 * so a long window cannot reach the domain: it degrades to "expires at the sales close", the safe direction.
 * A ceiling there would bound a value the use site already bounds. {@link
 * #aLongExpiryWindowIsAcceptedBecauseTheCutoffCapsIt} exists so that a later edit adding one for
 * symmetry reddens instead of passing quietly. {@code payWindow} has no such cap — it is subtracted
 * from {@code now} in the sweep — so it is bounded at both ends.
 *
 * <p><strong>Why a compact constructor and not {@code @Validated} + {@code @Min}.</strong> There is no
 * JSR-303 implementation on the runtime classpath (this project declined {@code spring-boot-starter-validation}),
 * and Boot validates {@code @ConfigurationProperties} only when one is present — an annotation would
 * bind and validate nothing.
 *
 * <p>The context-level tests show that Boot's binder <em>propagates</em> the record's exception into a
 * startup failure rather than swallowing it and falling back to a default. Each asserts the root cause
 * and message, not merely {@code hasFailed()}: any bind or bean-creation error satisfies the weaker
 * assertion.
 */
class RequestPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(BindOnly.class);

	@Configuration
	@EnableConfigurationProperties(RequestProperties.class)
	static class BindOnly {
	}

	@Test
	void bindsTheShippedWindows() {
		runner.run(context -> {
			RequestProperties props = context.getBean(RequestProperties.class);

			assertThat(props.expiryWindow())
					.as("unset config must reproduce today's behaviour exactly")
					.isEqualTo(Duration.ofHours(24));
			assertThat(props.payWindow()).isEqualTo(Duration.ofHours(12));
		});
	}

	@Test
	void aNonPositiveExpiryWindowFailsTheContext() {
		runner.withPropertyValues("booking.request.expiry-window=PT0S")
				.run(context -> assertThat(context)
						.as("every pending request would be born expired, so no accept can win the "
								+ "request_expires_at > now guard — the venue silently takes no bookings")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("booking.request.expiry-window"));
	}

	@Test
	void aNonPositivePayWindowFailsTheContext() {
		runner.withPropertyValues("booking.request.pay-window=PT0S")
				.run(context -> assertThat(context)
						.as("the sweep would expire the booking in the same instant the venue accepted it")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("booking.request.pay-window"));
	}

	@Test
	void anOversizedPayWindowFailsTheContext() {
		runner.withPropertyValues("booking.request.pay-window=PT120H")
				.run(context -> assertThat(context)
						.as("past the ceiling an unpaid accepted request holds its online-pool set across "
								+ "the whole span in which that date could still be sold")
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("booking.request.pay-window"));
	}

	/** The absent expiry-window ceiling is a decision (G-3), not an omission — this is what pins it. */
	@Test
	void aLongExpiryWindowIsAcceptedBecauseTheCutoffCapsIt() {
		runner.withPropertyValues("booking.request.expiry-window=P30D")
				.run(context -> assertThat(context.getBean(RequestProperties.class).expiryWindow())
						.as("ReserveSetService caps the deadline at the venue's sales close on D, so a long "
								+ "window degrades to 'expires at the sales close' — the safe direction")
						.isEqualTo(Duration.ofDays(30)));
	}

	@Test
	void acceptsTheWholeWindowRangeButNotBeyondIt() {
		assertThat(windows(RequestProperties.MIN_WINDOW, RequestProperties.MIN_WINDOW).payWindow())
				.as("the bounds bound the typo, not the operator — both ends are reachable")
				.isEqualTo(RequestProperties.MIN_WINDOW);
		assertThat(windows(Duration.ofDays(365), RequestProperties.MAX_PAY_WINDOW).payWindow())
				.isEqualTo(RequestProperties.MAX_PAY_WINDOW);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> windows(RequestProperties.MIN_WINDOW.minusSeconds(1),
						Duration.ofHours(12)))
				.withMessageContaining("booking.request.expiry-window");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> windows(Duration.ofHours(24), RequestProperties.MIN_WINDOW.minusSeconds(1)))
				.withMessageContaining("booking.request.pay-window");
		assertThatIllegalArgumentException()
				.isThrownBy(() -> windows(Duration.ofHours(24),
						RequestProperties.MAX_PAY_WINDOW.plusSeconds(1)));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> windows(Duration.ofHours(-24), Duration.ofHours(12)));
	}

	/** Unset config binds both as null — the guards must run AFTER the defaulting, never before. */
	@Test
	void unsetWindowsStillDefault() {
		assertThat(new RequestProperties(null, null))
				.isEqualTo(new RequestProperties(Duration.ofHours(24), Duration.ofHours(12)));
	}

	private static RequestProperties windows(Duration expiryWindow, Duration payWindow) {
		return new RequestProperties(expiryWindow, payWindow);
	}
}
