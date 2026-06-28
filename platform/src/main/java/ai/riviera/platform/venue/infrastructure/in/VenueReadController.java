package ai.riviera.platform.venue.infrastructure.in;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.api.VenueMapView;

/**
 * Public tourist read endpoint for a venue and its beach map (U1, issue #4). Driving
 * adapter — depends only on the {@code venue.api} port (invariant #11). Returns 200 with
 * the map, or 404 if no venue has that id.
 */
@RestController
@RequestMapping("/api/venues")
class VenueReadController {

	private final VenueCatalog catalog;

	VenueReadController(VenueCatalog catalog) {
		this.catalog = catalog;
	}

	@GetMapping("/{venueId}")
	ResponseEntity<VenueMapView> getVenue(@PathVariable long venueId) {
		return catalog.findVenueMap(new VenueId(venueId))
				.map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.notFound().build());
	}
}
