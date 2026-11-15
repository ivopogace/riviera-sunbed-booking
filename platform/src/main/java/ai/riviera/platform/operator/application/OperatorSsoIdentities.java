package ai.riviera.platform.operator.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorSsoLink;

/**
 * Driven persistence port for {@code operator_sso_identity} (#276), implemented by {@code adapter/out}'s
 * {@code JdbcOperatorSsoIdentities} (invariant #1); public for that adapter, never a named interface.
 */
public interface OperatorSsoIdentities {

	/** The linked operator's credential, in any status. */
	Optional<OperatorCredential> credentialFor(String issuer, String subject);

	/** Lock the operator row {@code FOR NO KEY UPDATE} while it is {@code ACTIVE} or {@code PENDING}. */
	Optional<OperableOperator> lockOperable(OperatorId operatorId);

	/** Insert the link; false when either unique key is already taken (nothing written). */
	boolean insert(OperatorId operatorId, String issuer, String subject);

	/** The operator this identity is linked to. */
	Optional<OperatorId> linkedOperator(String issuer, String subject);

	/** Whether this operator has a link for {@code issuer}. */
	boolean hasLink(OperatorId operatorId, String issuer);

	/** How many links this operator has. */
	int count(OperatorId operatorId);

	/** Delete this operator's link for {@code issuer}. */
	void delete(OperatorId operatorId, String issuer);

	/** Delete every link of this operator. */
	void deleteAll(OperatorId operatorId);

	/** This operator's links, oldest first. */
	List<OperatorSsoLink> links(OperatorId operatorId);

	/** A locked operator that may operate: its principal name and whether it holds a password. */
	record OperableOperator(String username, boolean hasPassword) {
	}
}
