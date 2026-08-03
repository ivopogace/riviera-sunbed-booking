package ai.riviera.platform.venue.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.venue.application.VenuePhotoTakedown;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The platform-admin photo takedown surface (#504) — the "remove" half of the report-and-remove
 * moderation stance (#230). Driving adapter depending only on the module's {@link VenuePhotoTakedown}
 * port; hosted in the module rather than at the composition root, like the other module-owned admin
 * surfaces (#391/#405/#454).
 *
 * <p><strong>Role-gated, not venue-scoped</strong> — and this endpoint is why that exemption matters.
 * A reported photo belongs to a venue the admin does not own, so the ownership assertion guarding
 * {@code DELETE /api/venues/{venueId}/photos/{slot}} refuses exactly the case moderation exists for
 * ({@code 403 NOT_VENUE_OWNER}, before the slot is even looked at). Living under {@code /api/admin/**}
 * takes the invariant-#13 exemption instead, and the {@code ADMIN} gate in {@code SecurityConfig} is
 * then the <strong>whole</strong> authorization: a plain {@code OPERATOR} is {@code 403}, anonymous
 * is {@code 401}. The operator's own delete/replace flow is untouched.
 *
 * <p>The path deliberately mirrors the operator's, differing only by the {@code /api/admin} prefix
 * that carries the authorization posture: the same operation under a different authority, which is
 * what it is. Errors are the one RFC-7807 contract (issue #97) — an empty slot, a venue with no
 * photos and an unknown venue all answer {@code 404 NO_SUCH_PHOTO}, so the surface distinguishes
 * none of them.
 */
@RestController
@RequestMapping("/api/admin/venues")
class AdminVenuePhotoController {

	private final VenuePhotoTakedown takedown;

	AdminVenuePhotoController(VenuePhotoTakedown takedown) {
		this.takedown = takedown;
	}

	@DeleteMapping("/{venueId}/photos/{slot}")
	ResponseEntity<?> remove(@PathVariable long venueId, @PathVariable String slot) {
		return takedown.takedown(new VenueId(venueId), PhotoSlots.parse(slot))
				? ResponseEntity.noContent().build()
				: ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_PHOTO", "No photo in this slot.");
	}
}
