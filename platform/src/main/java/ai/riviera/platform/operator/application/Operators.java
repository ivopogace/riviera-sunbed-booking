package ai.riviera.platform.operator.application;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;
import ai.riviera.platform.operator.vocabulary.PendingOperator;
import ai.riviera.platform.operator.vocabulary.VenueRef;

/**
 * Driven (outbound) persistence port for the {@code operator} module — the operator accounts (incl.
 * their stored credential) and the operator↔venue ownership mapping. Internal to the module (not
 * a published named interface); implemented by {@code adapter/out}'s {@code JdbcOperators} (invariant
 * #1 — JDBC only). A single purposeful port for the whole module's storage, mirroring
 * {@code venue.application.Venues}.
 */
public interface Operators {

	/**
	 * The id of the operator with this username when its status is in the may-operate set
	 * ({@code ACTIVE} or {@code PENDING}), or empty (unknown / suspended / rejected).
	 */
	Optional<OperatorId> idByOperableUsername(String username);

	/** The stored credential of the operator with this username (any status), or empty if unknown. */
	Optional<OperatorCredential> credentialByUsername(String username);

	/**
	 * Insert a new {@code ACTIVE} operator with this username + pre-encoded credential hash; returns
	 * the generated id. Propagates the username unique-constraint violation on a clash.
	 */
	OperatorId insert(String username, String passwordHash);

	/**
	 * Insert a self-registered {@code PENDING} operator with this username + pre-encoded hash + contact
	 * email, non-enumerating: a free username returns {@link OperatorRegistrationOutcome.Registered}, a
	 * taken one returns {@link OperatorRegistrationOutcome.AlreadyRegistered} writing nothing (D-8).
	 */
	OperatorRegistrationOutcome insertPending(String username, String passwordHash, String contactEmail);

	/** Every operator awaiting admin approval (status PENDING), oldest first. */
	List<PendingOperator> pendingOperators();

	/** Every operator that can currently authenticate (status ACTIVE), by username. */
	List<OperatorAccount> accounts();

	/**
	 * The username of the ACTIVE operator with this id, or empty (unknown / not ACTIVE) — read before
	 * a suspension so the edge can revoke that principal's sessions first.
	 */
	Optional<String> activeUsernameById(OperatorId operatorId);

	/**
	 * Transition the PENDING operator with this id to ACTIVE; see {@link ApprovalOutcome} for the
	 * pending/exists/absent cases. On success the outcome carries the operator's stored
	 * contact email, read by the same guarded statement that performed the transition.
	 */
	ApprovalOutcome activate(OperatorId operatorId);

	/** Transition the PENDING operator with this id to REJECTED; see {@link ApprovalOutcome}. */
	ApprovalOutcome rejectPending(OperatorId operatorId);

	/**
	 * Transition the ACTIVE operator with this id to SUSPENDED, returning
	 * {@link OperatorLifecycleOutcome.Changed} with its username so the edge can revoke its sessions.
	 * Writes nothing on a non-ACTIVE or unknown operator.
	 */
	OperatorLifecycleOutcome suspend(OperatorId operatorId);

	/** Transition the SUSPENDED operator with this id back to ACTIVE; see {@link #suspend}. */
	OperatorLifecycleOutcome reinstate(OperatorId operatorId);

	/** Update the stored credential of the operator with this username; returns rows affected. */
	int updatePassword(String username, String passwordHash);

	/**
	 * Whether {@code operator} owns {@code venue} — true iff an explicit {@code operator_venue}
	 * mapping row exists (the owns-all short-circuit was retired).
	 */
	boolean ownsVenue(OperatorId operator, VenueRef venue);

	/** The venues explicitly mapped to {@code operator}. */
	Set<VenueRef> ownedVenues(OperatorId operator);

	/** Record an {@code operator_venue} mapping row (creator-owns-on-create). */
	void assignOwner(OperatorId operator, VenueRef venue);

	/** Whether {@code venue} has an {@code ACTIVE} owning operator; no ownership row means no. */
	boolean hasActiveOwner(VenueRef venue);

	/** The subset of {@code venues} that have an {@code ACTIVE} owning operator. */
	Set<VenueRef> venuesWithActiveOwner(Collection<VenueRef> venues);
}
