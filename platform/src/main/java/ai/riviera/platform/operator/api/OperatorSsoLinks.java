package ai.riviera.platform.operator.api;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorSsoLink;
import ai.riviera.platform.operator.vocabulary.SsoLinkOutcome;
import ai.riviera.platform.operator.vocabulary.SsoUnlinkOutcome;

/**
 * An operator's linked Google/Apple sign-ins (#276), keyed on the OIDC {@code (issuer, subject)}, never on an email.
 * Link-only: the edge links for a signed-in operator that proved its password, and a sign-in only resolves. The OIDC
 * exchange, sessions and the may-authenticate check are the edge's (RV-BE-11). Rationale: RESPONSIBILITIES.md §operator.
 */
public interface OperatorSsoLinks {

	/** The credential of the operator this identity is linked to, in any status; empty when unlinked. */
	Optional<OperatorCredential> resolve(String issuer, String subject);

	/** Link the identity to this operator while it may operate ({@code ACTIVE} or {@code PENDING}). */
	SsoLinkOutcome link(OperatorId operatorId, String issuer, String subject);

	/** Remove this operator's link for {@code issuer}, unless it is the operator's last credential. */
	SsoUnlinkOutcome unlink(OperatorId operatorId, String issuer);

	/** This operator's links, oldest first. */
	List<OperatorSsoLink> links(OperatorId operatorId);
}
