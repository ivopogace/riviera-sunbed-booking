package ai.riviera.platform.itinerary.adapter.in;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.itinerary.application.PlanItinerary;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The public stitched-plan read for a venue and a stay ({@code date} to {@code lastDate}, both
 * required), optionally anchored on {@code anchorSetId}. A bad span or a foreign anchor is
 * {@code 400}; a hidden or unknown venue {@code 404}; otherwise {@code 200} with a {@code null} plan
 * when none fits the budget.
 */
@RestController
@RequestMapping("/api/venues/{venueId}/itinerary")
class ItineraryController {

	private final PlanItinerary planner;

	ItineraryController(PlanItinerary planner) {
		this.planner = planner;
	}

	@GetMapping
	ResponseEntity<ItineraryView> plan(@PathVariable long venueId,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate lastDate,
			@RequestParam(required = false) Long anchorSetId) {
		StaySpan stay = InvalidApiRequestException.parsing(() -> new StaySpan(date, lastDate));
		Optional<SetId> anchor = Optional.ofNullable(anchorSetId).map(SetId::new);
		return InvalidApiRequestException.parsing(() -> planner.plan(new VenueId(venueId), stay, anchor))
				.map(itinerary -> ResponseEntity.ok(ItineraryView.of(itinerary)))
				.orElseGet(() -> ResponseEntity.notFound().build());
	}
}
