package ai.riviera.platform.notification.application;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The reinstatement use case: stamp the lift with the injected clock, and leave one audit
 * line behind carrying <strong>technical data only</strong> (the structured-logging pattern, as
 * applied by {@code AccountErasureService}).
 *
 * <p>The PII assertions here are the point of the class, not decoration. The port takes a
 * <em>raw</em> address, so this service is the last place a real tourist's address could leak into a
 * log — and ADR-0012 exists precisely because the suppression list must hold no cleartext. The
 * {@code domain} is excluded too, which is <em>not</em> obvious: ADR-0012 calls a bare domain
 * non-PII, so logging it looks free. It is not — V34's CHECK bans only <em>edge</em> whitespace, so
 * a junk address normalizes to a domain that can contain a newline, making it a log-forging vector
 * ({@code riviera-java-conventions} §10).
 */
@ExtendWith(OutputCaptureExtension.class)
class SuppressionReinstatementServiceTest {

	private static final String LOCAL_PART = "recovered-tourist";
	private static final String DOMAIN = "private-domain.example.com";
	private static final String EMAIL = LOCAL_PART + "@" + DOMAIN;

	private static final Instant NOW = Instant.parse("2026-07-28T06:15:00Z");
	private static final Instant FIRST_SUPPRESSED = Instant.parse("2026-07-20T08:31:00Z");

	private final EmailSuppressions suppressions = mock(EmailSuppressions.class);

	private final ReinstateSuppression service =
			new SuppressionReinstatementService(suppressions, Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	void stampsTheLiftWithTheInjectedClock() {
		when(suppressions.reinstate(any(), any())).thenReturn(reinstated());

		service.reinstate(EMAIL);

		verify(suppressions).reinstate(EMAIL, NOW);
	}

	@Test
	void returnsThePortsOutcomeUnchanged() {
		when(suppressions.reinstate(any(), any())).thenReturn(reinstated());

		assertThat(service.reinstate(EMAIL)).isEqualTo(reinstated());
	}

	@Test
	void logsTheOutcomeWithoutTheAddressOrItsDomain(CapturedOutput output) {
		when(suppressions.reinstate(any(), any())).thenReturn(reinstated());

		service.reinstate(EMAIL);

		assertThat(output).contains("REINSTATED").contains("HARD_BOUNCE");
		assertThat(output).as("the address must never reach a log line (ADR-0012)").doesNotContain(LOCAL_PART);
		assertThat(output)
				.as("nor the domain — a junk address can normalize to one carrying a newline, which "
						+ "would forge log lines (riviera-java-conventions §10)")
				.doesNotContain(DOMAIN);
	}

	@Test
	void logsTheNoOpOutcomesToo(CapturedOutput output) {
		when(suppressions.reinstate(any(), any())).thenReturn(new ReinstateOutcome.NotSuppressed());

		service.reinstate(EMAIL);

		assertThat(output).contains("NOT_SUPPRESSED");
		assertThat(output).doesNotContain(LOCAL_PART).doesNotContain(DOMAIN);
	}

	private static ReinstateOutcome reinstated() {
		return new ReinstateOutcome.Reinstated(SuppressionReason.HARD_BOUNCE, FIRST_SUPPRESSED, NOW);
	}
}
