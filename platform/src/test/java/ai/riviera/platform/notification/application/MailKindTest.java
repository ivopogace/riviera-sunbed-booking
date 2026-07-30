package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

import ai.riviera.platform.shared.ObservabilityMetrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The in-memory vehicle's {@code kind} vocabulary (#442), and why it is one type rather than a set of
 * string constants.
 *
 * <p>Both of this vehicle's loss counters are read through {@code kind}:
 * {@link ObservabilityMetrics#MAIL_RECOVERY_FAILED} for the send it accepted and could not deliver, and —
 * since #442 — {@link ObservabilityMetrics#MAIL_RECOVERY_DROPPED} for the send it never ran. They are
 * raised from two different classes, on two different threads, at two different moments. <strong>A kind
 * spelled {@code password_reset} on one and {@code password-reset} on the other would pass every other
 * test in this package</strong> and quietly re-open the attribution gap #442 closed — the query that
 * joins them would just return nothing, exactly as filtering the {@code dropped} series by {@code kind}
 * did for the two slices before this one.
 */
class MailKindTest {

	private static final MailTransportBudget BUDGET = new MailTransportBudget(Duration.ofMillis(10_000));

	private static final String EMAIL = "tourist@example.com";

	private static final URI LINK = URI.create("https://riviera.example/account/reset?token=t");

	private final MeterRegistry meters = new SimpleMeterRegistry();

	/**
	 * The values are the metric's public vocabulary — `docs/runbooks/observability.md` tells an on-call
	 * reader to filter on them by name. Renaming one is not a refactor; it is breaking whatever already
	 * reads the series, which is the same reason the {@code riviera.mail.recovery.*} names outlived the
	 * flows they were coined for.
	 */
	@Test
	void theShippedTagValuesAreStable() {
		assertThat(Arrays.stream(MailKind.values()).map(MailKind::tagValue).toList())
				.as("a dashboard or alert filtering on these names must keep matching")
				.containsExactly("verification", "password-reset", "operator-approved");
	}

	@Test
	void bothLossCountersShareOneKindVocabulary() {
		everyKindIsDropped();
		everyKindFailsToSend();

		assertThat(kindTagsOn(ObservabilityMetrics.MAIL_RECOVERY_DROPPED))
				.as("the two loss counters must agree on what a kind is called, or the pair cannot be read "
						+ "together during an incident")
				.isEqualTo(kindTagsOn(ObservabilityMetrics.MAIL_RECOVERY_FAILED))
				.isEqualTo(shippedTagValues());
	}

	/** A drop of every kind: the cheapest reason to provoke is a dispatcher that has already shut down. */
	private void everyKindIsDropped() {
		AsyncMailDispatcher dispatcher = new AsyncMailDispatcher(meters, BUDGET);
		dispatcher.destroy();
		for (MailKind kind : MailKind.values()) {
			dispatcher.dispatch(kind, () -> {
			});
		}
	}

	/** A transport failure of every kind, driven through the port methods the kinds correspond to. */
	private void everyKindFailsToSend() {
		Mailer mailer = mock(Mailer.class);
		EmailSuppressions suppressions = mock(EmailSuppressions.class);
		when(suppressions.isSuppressed(any())).thenReturn(false);
		doThrow(new IllegalStateException("relay down")).when(mailer).sendEmailVerification(any(), any());
		doThrow(new IllegalStateException("relay down")).when(mailer).sendPasswordReset(any(), any());
		doThrow(new IllegalStateException("relay down")).when(mailer).sendOperatorApproved(any(), any());

		TransactionalMailService service =
				new TransactionalMailService(mailer, (kind, send) -> send.run(), suppressions, meters);
		service.sendEmailVerification(EMAIL, LINK);
		service.sendPasswordReset(EMAIL, LINK);
		service.sendOperatorApproved(EMAIL, LINK);
	}

	private List<String> kindTagsOn(String meterName) {
		return meters.find(meterName)
				.counters()
				.stream()
				.map(counter -> counter.getId().getTag(MailKind.TAG))
				.distinct()
				.sorted()
				.toList();
	}

	private static List<String> shippedTagValues() {
		return Arrays.stream(MailKind.values()).map(MailKind::tagValue).sorted().toList();
	}
}
