package ai.riviera.platform.venue.adapter.in;

import java.util.List;

import ai.riviera.platform.venue.application.OperatorBeachMap;
import ai.riviera.platform.venue.vocabulary.VenueMapView;

/**
 * The owner's beach-map read on the wire: the venue map in the public read's exact shape under
 * {@code map}, and the sparse {@code locks} list beside it — one {@link SetLockView} per set a live
 * claim pins, ordered by set id, nothing for a free set.
 */
record OperatorBeachMapView(VenueMapView map, List<SetLockView> locks) {

	static OperatorBeachMapView of(OperatorBeachMap beachMap) {
		return new OperatorBeachMapView(beachMap.map(),
				beachMap.locks().stream().map(SetLockView::of).toList());
	}
}
