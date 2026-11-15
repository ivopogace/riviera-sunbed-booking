package ai.riviera.platform.operator.application;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorSsoLinks;
import ai.riviera.platform.operator.application.OperatorSsoIdentities.OperableOperator;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorSsoLink;
import ai.riviera.platform.operator.vocabulary.SsoLinkOutcome;
import ai.riviera.platform.operator.vocabulary.SsoUnlinkOutcome;

/**
 * Linked sign-ins behind {@link OperatorSsoLinks} (#276). Each write first locks the operator row while it may
 * operate, the row a suspend and a reset lock, so a link never lands on an account a suspend just closed.
 */
@Service
class OperatorSsoLinkService implements OperatorSsoLinks {

	private final OperatorSsoIdentities identities;

	OperatorSsoLinkService(OperatorSsoIdentities identities) {
		this.identities = identities;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<OperatorCredential> resolve(String issuer, String subject) {
		return identities.credentialFor(issuer, subject);
	}

	@Override
	@Transactional
	public SsoLinkOutcome link(OperatorId operatorId, String issuer, String subject) {
		if (identities.lockOperable(operatorId).isEmpty()) {
			return new SsoLinkOutcome.NotOperable();
		}
		if (identities.insert(operatorId, issuer, subject)
				|| identities.linkedOperator(issuer, subject).filter(operatorId::equals).isPresent()) {
			return new SsoLinkOutcome.Linked();
		}
		return new SsoLinkOutcome.Conflict();
	}

	@Override
	@Transactional
	public SsoUnlinkOutcome unlink(OperatorId operatorId, String issuer) {
		Optional<OperableOperator> operator = identities.lockOperable(operatorId);
		if (operator.isEmpty() || !identities.hasLink(operatorId, issuer)) {
			return new SsoUnlinkOutcome.NotLinked();
		}
		if (!operator.get().hasPassword() && identities.count(operatorId) == 1) {
			return new SsoUnlinkOutcome.LastCredential();
		}
		identities.delete(operatorId, issuer);
		return new SsoUnlinkOutcome.Unlinked(operator.get().username());
	}

	@Override
	@Transactional(readOnly = true)
	public List<OperatorSsoLink> links(OperatorId operatorId) {
		return identities.links(operatorId);
	}
}
