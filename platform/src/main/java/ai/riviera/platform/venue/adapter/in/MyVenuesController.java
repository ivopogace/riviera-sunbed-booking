package ai.riviera.platform.venue.adapter.in;

import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.venue.application.ListOwnedVenues;
import ai.riviera.platform.venue.application.OwnedVenueView;

/**
 * {@code GET /api/venues/mine}: the signed-in operator's venues, which pick the post-sign-in
 * landing (0 → onboarding, 1 → that console, N → picker); none is {@code 200 []}, not {@code 404}.
 * BOLA-safe (invariant #13): no venue id in the request; the session names the set. Its
 * {@code hasRole(OPERATOR)} rule in {@code SecurityConfig} must stay above the public
 * {@code GET /api/venues/**} {@code permitAll} (first match wins) or this leaks the ownership map;
 * anonymous gets {@code 401}, a customer {@code 403}. Rationale: RESPONSIBILITIES.md §venue.
 */
@RestController
@RequestMapping("/api/venues")
class MyVenuesController {

	private final ListOwnedVenues listOwnedVenues;
	private final CurrentOperator currentOperator;

	MyVenuesController(ListOwnedVenues listOwnedVenues, CurrentOperator currentOperator) {
		this.listOwnedVenues = listOwnedVenues;
		this.currentOperator = currentOperator;
	}

	@GetMapping("/mine")
	List<OwnedVenueView> myVenues(Authentication authentication) {
		return listOwnedVenues.ownedBy(currentOperator.require(authentication));
	}
}
