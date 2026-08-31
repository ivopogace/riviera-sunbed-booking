package ai.riviera.platform.operator.application;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.VenueRef;

/**
 * The {@code operator} module's application service (invariant #13): resolves a principal to an
 * {@link OperatorId} and answers the ownership and tourist-visibility questions. Package-private
 * behind the published {@link VenueOwnership} / {@link OperatorDirectory} / {@link VenueVisibility}
 * ports (invariant #11); constructor injection into a {@code final} {@link Operators} port.
 * Read-only — both decisions are pure queries; no {@code @Transactional} write path in this slice.
 *
 * <p>It performs no enforcement of its own beyond answering: each venue-scoped service calls
 * {@link #assertOwns} and maps the failure to {@code 403}. That keeps {@code operator} out of every
 * request path (RESPONSIBILITIES.md — it owns the mapping, not the check site). The one write is
 * {@link #assignOwner} (creator-owns-on-create), which joins the caller's transaction.
 */
@Service
class OperatorService implements VenueOwnership, OperatorDirectory, VenueVisibility {

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
	@Transactional
	public void assignOwner(OperatorId operator, VenueRef venue) {
		operators.assignOwner(operator, venue);
	}

	@Override
	public Optional<OperatorId> operatorFor(String username) {
		return operators.idByOperableUsername(username);
	}

	@Override
	public boolean isVisible(VenueRef venue) {
		return operators.hasActiveOwner(venue);
	}

	@Override
	public Set<VenueRef> visibleAmong(Collection<VenueRef> venues) {
		return operators.venuesWithActiveOwner(venues);
	}
}
