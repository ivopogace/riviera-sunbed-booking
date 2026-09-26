package ai.riviera.platform.venue.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.application.CommissionRateCommand;
import ai.riviera.platform.venue.application.VenueCommissionAdministration;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The platform-admin commission-rate surface: every venue's rate, tourist-hidden venues included,
 * and the write that corrects one. Role-gated, not venue-scoped: {@code /api/admin/**} is exempt
 * from invariant #13, so the {@code ADMIN} gate in {@code SecurityConfig} is the whole authorization
 * (a plain {@code OPERATOR} is 403); the edge audits each write. An unknown venue is an unblurred
 * {@code 404 NO_SUCH_VENUE}; a bad rate is 400 via {@link InvalidApiRequestException#parsing}.
 * Forward-only, and never the owner's {@code PATCH}: {@code RESPONSIBILITIES.md} §venue.
 */
@RestController
@RequestMapping("/api/admin/venues")
class AdminVenueCommissionController {

	private final VenueCommissionAdministration commissions;

	AdminVenueCommissionController(VenueCommissionAdministration commissions) {
		this.commissions = commissions;
	}

	@GetMapping
	AdminVenueCommissionsResponse venues() {
		return AdminVenueCommissionsResponse.from(commissions.venueCommissions());
	}

	@PutMapping("/{venueId}/commission")
	ResponseEntity<?> setCommission(@PathVariable long venueId,
			@RequestBody SetCommissionRequest request) {
		CommissionRateCommand command = InvalidApiRequestException.parsing(request::toCommand);
		return commissions.setCommission(new VenueId(venueId), command)
				.<ResponseEntity<?>>map(venue -> ResponseEntity
						.ok(AdminVenueCommissionsResponse.VenueCommission.from(venue)))
				.orElseGet(() -> ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_VENUE",
						"No venue with this id."));
	}
}
