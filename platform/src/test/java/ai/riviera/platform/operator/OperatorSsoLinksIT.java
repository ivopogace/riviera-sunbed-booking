package ai.riviera.platform.operator;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorPasswordReset;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.api.OperatorSsoLinks;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorResetOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorSsoLink;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;
import ai.riviera.platform.operator.vocabulary.SsoLinkOutcome;
import ai.riviera.platform.operator.vocabulary.SsoUnlinkOutcome;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link OperatorSsoLinks} against Testcontainers Postgres, so V87's two unique keys are exercised (#276): a link
 * resolves to its operator in any status, a taken identity or a second identity from one issuer is one
 * {@code Conflict}, a non-operable operator links nothing, unlink keeps the last credential, and a reset drops links.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OperatorSsoLinksIT {

	private static final String GOOGLE = "https://accounts.google.com";
	private static final String APPLE = "https://appleid.apple.com";
	private static final String HASH = "{bcrypt}not-checked-here";

	@Autowired
	OperatorSsoLinks links;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	OperatorPasswordReset passwordReset;
	@Autowired
	JdbcClient jdbc;

	@Test
	void aLinkedIdentityResolvesToItsOperatorInAnyStatus() {
		String username = uniqueName();
		OperatorId operator = provisioning.provision(username, HASH);
		String subject = uniqueName();

		assertInstanceOf(SsoLinkOutcome.Linked.class, links.link(operator, GOOGLE, subject));
		setStatus(operator, OperatorStatus.SUSPENDED);

		var credential = links.resolve(GOOGLE, subject).orElseThrow();
		assertEquals(username, credential.username());
		assertEquals(OperatorStatus.SUSPENDED, credential.status());
		assertTrue(links.resolve(APPLE, subject).isEmpty(), "a subject is unique only within its issuer");
	}

	@Test
	void relinkingTheSameIdentityIsIdempotent() {
		OperatorId operator = provisioning.provision(uniqueName(), HASH);
		String subject = uniqueName();
		links.link(operator, GOOGLE, subject);

		assertInstanceOf(SsoLinkOutcome.Linked.class, links.link(operator, GOOGLE, subject));
		assertEquals(1, links.links(operator).size());
	}

	@Test
	void anIdentityLinkedElsewhereAndASecondIdentityPerIssuerAreOneConflict() {
		OperatorId owner = provisioning.provision(uniqueName(), HASH);
		OperatorId other = provisioning.provision(uniqueName(), HASH);
		String subject = uniqueName();
		links.link(owner, GOOGLE, subject);

		assertInstanceOf(SsoLinkOutcome.Conflict.class, links.link(other, GOOGLE, subject));
		assertInstanceOf(SsoLinkOutcome.Conflict.class, links.link(owner, GOOGLE, uniqueName()));
		assertEquals(owner.value(), linkedOperator(subject));
		assertInstanceOf(SsoLinkOutcome.Linked.class, links.link(owner, APPLE, subject),
				"another issuer is another identity");
	}

	@Test
	void aSuspendedOrRejectedOperatorLinksNothing() {
		OperatorId suspended = provisioning.provision(uniqueName(), HASH);
		setStatus(suspended, OperatorStatus.SUSPENDED);
		OperatorId rejected = provisioning.provision(uniqueName(), HASH);
		setStatus(rejected, OperatorStatus.REJECTED);

		assertInstanceOf(SsoLinkOutcome.NotOperable.class, links.link(suspended, GOOGLE, uniqueName()));
		assertInstanceOf(SsoLinkOutcome.NotOperable.class, links.link(rejected, GOOGLE, uniqueName()));
		assertInstanceOf(SsoLinkOutcome.NotOperable.class, links.link(new OperatorId(-1), GOOGLE, uniqueName()));
		assertTrue(links.links(suspended).isEmpty());
	}

	@Test
	void unlinkRemovesTheLinkAndNamesThePrincipal() {
		String username = uniqueName();
		OperatorId operator = provisioning.provision(username, HASH);
		links.link(operator, GOOGLE, uniqueName());
		links.link(operator, APPLE, uniqueName());

		assertEquals(new SsoUnlinkOutcome.Unlinked(username), links.unlink(operator, GOOGLE));
		assertInstanceOf(SsoUnlinkOutcome.NotLinked.class, links.unlink(operator, GOOGLE));
		List<OperatorSsoLink> remaining = links.links(operator);
		assertEquals(1, remaining.size());
		assertEquals(APPLE, remaining.getFirst().issuer());
	}

	@Test
	void unlinkRefusesTheLastCredential() {
		OperatorId operator = provisioning.provision(uniqueName(), HASH);
		links.link(operator, GOOGLE, uniqueName());
		links.link(operator, APPLE, uniqueName());
		jdbc.sql("UPDATE operator SET password_hash = NULL WHERE id = :id").param("id", operator.value()).update();

		assertInstanceOf(SsoUnlinkOutcome.Unlinked.class, links.unlink(operator, GOOGLE));
		assertInstanceOf(SsoUnlinkOutcome.LastCredential.class, links.unlink(operator, APPLE));
		assertEquals(1, links.links(operator).size());
	}

	@Test
	void redeemingAnAdminIssuedResetDeletesEveryLink() {
		OperatorId operator = provisioning.provision(uniqueName(), HASH);
		links.link(operator, GOOGLE, uniqueName());
		links.link(operator, APPLE, uniqueName());
		String tokenHash = uniqueName();
		passwordReset.issue(operator, tokenHash, java.time.Instant.now().plusSeconds(600));

		assertInstanceOf(OperatorResetOutcome.Reset.class, passwordReset.resetPassword(tokenHash, HASH));
		assertTrue(links.links(operator).isEmpty());
	}

	private void setStatus(OperatorId operator, OperatorStatus status) {
		jdbc.sql("UPDATE operator SET status = :status WHERE id = :id")
				.param("status", status.name()).param("id", operator.value()).update();
	}

	private long linkedOperator(String subject) {
		return jdbc.sql("SELECT operator_id FROM operator_sso_identity WHERE issuer = :issuer AND subject = :subject")
				.param("issuer", GOOGLE).param("subject", subject).query(Long.class).single();
	}

	private static String uniqueName() {
		return "sso-" + UUID.randomUUID().toString().substring(0, 12);
	}
}
