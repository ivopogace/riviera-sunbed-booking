package ai.riviera.platform.notification.application;

import org.junit.jupiter.api.Test;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.dao.TransientDataAccessResourceException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The query port's contract (#400): it answers the same do-not-mail list {@link TransactionalMailService}
 * consults, and it <strong>degrades rather than fails</strong> — an unanswerable lookup reports "not
 * withheld", so the resend surface falls back to today's copy instead of turning a {@code 204}-shaped
 * flow into a {@code 500}.
 *
 * <p>The degrade is deliberately wider than the send path's transient-only carve-out (#386): dropping a
 * bearer-credential mail on a structurally broken lookup is a real harm, whereas showing one advisory
 * sentence too few is not.
 */
class MailDeliverabilityServiceTest {

	private static final String EMAIL = "tourist@example.com";

	private final EmailSuppressions suppressions = mock(EmailSuppressions.class);
	private final MailDeliverabilityService service = new MailDeliverabilityService(suppressions);

	@Test
	void reportsWithheldForASuppressedAddress() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(true);

		assertThat(service.isWithheld(EMAIL)).isTrue();
	}

	@Test
	void reportsDeliverableForAnUnlistedAddress() {
		when(suppressions.isSuppressed(EMAIL)).thenReturn(false);

		assertThat(service.isWithheld(EMAIL)).isFalse();
	}

	@Test
	void reportsDeliverableWhenTheLookupFailsTransiently() {
		when(suppressions.isSuppressed(any())).thenThrow(new TransientDataAccessResourceException("wedged"));

		assertThat(service.isWithheld(EMAIL)).isFalse();
	}

	@Test
	void reportsDeliverableWhenTheLookupIsStructurallyBroken() {
		when(suppressions.isSuppressed(any())).thenThrow(new InvalidDataAccessResourceUsageException("no column"));

		assertThat(service.isWithheld(EMAIL)).isFalse();
	}
}
