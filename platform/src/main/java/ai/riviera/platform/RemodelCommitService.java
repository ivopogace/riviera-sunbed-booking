package ai.riviera.platform;

import java.util.List;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.VenueId;

/** The remodel commit's orchestration at the platform edge (ADR-0020). */
@Component
class RemodelCommitService {

	RemodelCommitOutcome commit(OperatorId operator, VenueId venue, long expectedVersion, List<LayoutCell> cells,
			PreviewToken token) {
		throw new UnsupportedOperationException("the commit is built in phase 3");
	}
}
