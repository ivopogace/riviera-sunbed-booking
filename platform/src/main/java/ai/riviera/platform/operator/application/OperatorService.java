package ai.riviera.platform.operator.application;

import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;

/**
 * The {@code operator} module's application service (invariant #13): resolves a principal to an
 * {@link OperatorId} and answers the ownership question. Package-private behind the published
 * {@link VenueOwnership} / {@link OperatorDirectory} ports (invariant #11); constructor injection
 * into a {@code final} {@link Operators} port. Read-only — the ownership decision is a pure query;
 * no {@code @Transactional} write path in this slice.
 *
 * <p>It performs no enforcement of its own beyond answering: each venue-scoped service calls
 * {@link #assertOwns} and maps the failure to {@code 403}. That keeps {@code operator} out of every
 * request path (RESPONSIBILITIES.md — it owns the mapping, not the check site).
 */
@Service
class OperatorService implements VenueOwnership, OperatorDirectory {

	private final Operators operators;

	OperatorService(Operators operators) {
		this.operators = operators;
	}

	@Override
	public void assertOwns(OperatorId operator, VenueRef venue) {
		if (!operators.ownsVenue(operator, venue)) {
			throw new NotVenueOwnerException(operator, venue);
		}
	}

	@Override
	public Set<VenueRef> ownedVenues(OperatorId operator) {
		return operators.ownedVenues(operator);
	}

	@Override
	public Optional<OperatorId> operatorFor(String username) {
		return operators.idByActiveUsername(username);
	}
}
