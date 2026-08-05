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
 * The platform-admin commission-rate surface (A7, epic #348) — the list of every venue's rate and the
 * write that corrects one. Driving adapter depending only on the module's
 * {@link VenueCommissionAdministration} port; hosted in the module rather than at the composition root,
 * like the other module-owned admin surfaces (#391/#405/#454/#504).
 *
 * <p><strong>Why this surface has to exist.</strong> A venue's commission was settable only at
 * creation: the owner-asserted profile {@code PATCH} treats it as display-only, deliberately (O8
 * #177 — a venue does not set its own commission), and nothing else could write it, so a rate typed
 * wrong at onboarding was permanent. Widening the operator's {@code PATCH} would have been the wrong
 * fix; the authority to change a commercial term belongs to the platform, not the counterparty.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> An admin does not own a rate, so there is nothing
 * for object-level authorization to check, and the venue-scoped alternative would answer the admin
 * {@code 403 NOT_VENUE_OWNER} — refusing exactly the case this exists for. Living under
 * {@code /api/admin/**} takes the invariant-#13 exemption instead, and the {@code ADMIN} gate in
 * {@code SecurityConfig} is then the <strong>whole</strong> authorization: a plain {@code OPERATOR} is
 * {@code 403}, anonymous is {@code 401}.
 *
 * <p>Errors are the one RFC-7807 contract (#97): an unknown venue is {@code 404 NO_SUCH_VENUE}, and a
 * missing or out-of-range rate is {@code 400 INVALID_REQUEST} via
 * {@link InvalidApiRequestException#parsing} at the conversion boundary — so the range guard yields a
 * 400 when a client trips it and would still yield a 500 if stored state ever did (#118). Unlike the
 * photo-moderation twin this surface does not blur venue existence: venues are already enumerable
 * through the anonymous discovery read, and an admin correcting a rate needs a mistyped id to fail
 * loudly. The audit record is written at the edge for every mutating {@code /api/admin/**} action
 * (#507), so there is no instrumentation here.
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
