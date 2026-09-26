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
 * Application service (invariant #13) resolving a principal to an {@link OperatorId} and answering
 * the ownership and tourist-visibility questions, package-private behind {@link VenueOwnership} /
 * {@link OperatorDirectory} / {@link VenueVisibility} (invariant #11). It enforces nothing itself:
 * each venue-scoped service calls {@link #assertOwns} and maps the failure to {@code 403}, so
 * {@code operator} owns the mapping, not the check site. Reads are pure queries; the one write,
 * {@link #assignOwner} (creator-owns-on-create), joins the caller's transaction.
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
