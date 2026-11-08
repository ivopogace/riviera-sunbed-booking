package ai.riviera.platform.payment.adapter.out;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.application.WebhookEvents;
import ai.riviera.platform.payment.domain.PaymentProvider;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The webhook dedup key through its port: one row per {@code (provider, reference)}, against real
 * Postgres. The derived references are the shapes ADR-0029 decision 4 sets for a provider with no event
 * id; building them is the provider adapter's job, so they are literals here.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcWebhookEventsIT {

	private static final String TYPE = "any.type";

	@Autowired
	WebhookEvents webhookEvents;

	@Test
	void anEventIsFirstSeenOnceThenADuplicate() {
		assertTrue(webhookEvents.firstSeen(PaymentProvider.STRIPE, "evt_dedup_once", TYPE));
		assertFalse(webhookEvents.firstSeen(PaymentProvider.STRIPE, "evt_dedup_once", TYPE),
				"a redelivered event id is a no-op (invariant #8)");
	}

	@Test
	void theSameReferenceIsRecordedOncePerProvider() {
		assertTrue(webhookEvents.firstSeen(PaymentProvider.STRIPE, "shared_ref_1", TYPE));
		assertTrue(webhookEvents.firstSeen(PaymentProvider.PAYSERA, "shared_ref_1", TYPE),
				"one provider's reference never collides with another's");

		assertFalse(webhookEvents.firstSeen(PaymentProvider.STRIPE, "shared_ref_1", TYPE),
				"a repeat under the first provider is still deduplicated");
		assertFalse(webhookEvents.firstSeen(PaymentProvider.PAYSERA, "shared_ref_1", TYPE),
				"a repeat under the second provider is still deduplicated");
	}

	@Test
	void aDerivedReferenceDeduplicatesARepeat() {
		String derived = "merchant-7:sdk-order-11:COMPLETED";

		assertTrue(webhookEvents.firstSeen(PaymentProvider.POK, derived, "COMPLETED"));
		assertFalse(webhookEvents.firstSeen(PaymentProvider.POK, derived, "COMPLETED"),
				"a provider with no event id repeats a notification under the same derived reference");
	}

	@Test
	void aLaterStatusForTheSameOrderGetsThrough() {
		assertTrue(webhookEvents.firstSeen(PaymentProvider.PAYSERA, "project-3:order-21:2", "2"));

		assertTrue(webhookEvents.firstSeen(PaymentProvider.PAYSERA, "project-3:order-21:1", "1"),
				"the paid status is a new fact for the order, so an earlier status must not consume it");
		assertFalse(webhookEvents.firstSeen(PaymentProvider.PAYSERA, "project-3:order-21:1", "1"),
				"that status repeated is a duplicate");
	}

	@ParameterizedTest
	@EnumSource(PaymentProvider.class)
	void everyProviderIsAdmittedByTheSchema(PaymentProvider provider) {
		assertTrue(webhookEvents.firstSeen(provider, "ref_admitted_" + provider, TYPE),
				"PaymentProvider and payment_webhook_event_provider_check move in lockstep");
	}
}
