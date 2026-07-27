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
 * The signed-in operator's own venues (S9, issue #277) — {@code GET /api/venues/mine}, the read the
 * unified auth page uses to decide where an operator lands after sign-in (0 → venue onboarding,
 * 1 → straight into that console, N → the picker).
 *
 * <p><strong>BOLA-safe by construction</strong> (invariant #13, OWASP API #1): there is no venue id
 * in the path or query — the venue set is derived solely from the session principal via the edge
 * {@link CurrentOperator} resolver, so there is nothing for a caller to tamper with and no
 * {@code assertOwns} to forget. The role layer ({@code hasRole(OPERATOR)}) is configured in
 * {@code SecurityConfig} <strong>above</strong> the public {@code GET /api/venues/**} rule — first
 * match wins, so without that ordering this read would fall through to {@code permitAll} and leak
 * the ownership map. An anonymous call is {@code 401}, a customer session {@code 403}.
 *
 * <p>Separate from {@link VenueAdminController} because it is not venue-scoped: every mapping there
 * takes a path {@code venueId} and asserts ownership of it, whereas this one <em>is</em> the
 * ownership question. The literal {@code /mine} segment outranks {@link VenueReadController}'s
 * {@code /{venueId}} pattern in Spring's pattern comparator, so it never resolves as a venue id.
 * Empty ownership is {@code 200 []}, never {@code 404}.
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
