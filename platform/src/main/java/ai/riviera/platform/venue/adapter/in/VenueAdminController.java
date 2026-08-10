package ai.riviera.platform.venue.adapter.in;

import java.net.URI;
import java.time.LocalDate;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.application.AddSetOutcome;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.EditVenueProfile;
import ai.riviera.platform.venue.application.OnboardVenue;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.ReplaceRejection;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.application.ViewDailyAvailability;
import ai.riviera.platform.venue.application.ViewVenueProfile;

/**
 * Operator write endpoints for venue onboarding + beach-map editing (U7, issue #7). Driving
 * adapter — depends only on the {@code venue} module's {@link OnboardVenue} / {@link EditBeachMap}
 * ports (invariant #11) plus the edge {@link CurrentOperator} resolver. These are an authenticated
 * operator surface (session cookie, role {@code OPERATOR}, configured in {@code SecurityConfig}); the
 * public U1 read endpoint is a separate controller. Outcomes map to HTTP via exhaustive
 * {@code switch}: created→201 (+Location), applied→204, {@code NO_SUCH_*}→404,
 * {@code CELL_TAKEN}/{@code DUPLICATE_POSITION}→409; malformed→400 and the
 * constraint-race backstop ({@code DuplicateKeyException}→409 {@code CONFLICT},
 * invariant #12) map centrally in {@code ApiErrorHandler}. Errors are RFC-7807
 * {@link ProblemDetail} built by {@link ApiProblem}.
 *
 * <p>The per-set edits and the profile edit ({@code PATCH /api/venues/{venueId}} — amenities +
 * distance-to-water) are venue-scoped: the controller resolves the authenticated principal
 * to an {@link OperatorId} and hands it to {@link EditBeachMap} / {@link EditVenueProfile}, which
 * asserts ownership of {@code venueId} before acting (invariant #13); a mismatch is {@code 403} via
 * {@code ApiErrorHandler}. {@code create} takes no {@code venueId} — it resolves the authenticated
 * operator and the service records it as the new venue's owner (creator-owns-on-create).
 */
@RestController
@RequestMapping("/api/venues")
class VenueAdminController {

	/** The 404 problem detail shared by every NO_SUCH_VENUE outcome (profile write + beach-map edits). */
	private static final String NO_SUCH_VENUE_DETAIL = "No such venue.";

	private final OnboardVenue onboardVenue;
	private final EditBeachMap editBeachMap;
	private final EditVenueProfile editVenueProfile;
	private final ViewVenueProfile viewVenueProfile;
	private final ViewDailyAvailability viewDailyAvailability;
	private final CurrentOperator currentOperator;

	VenueAdminController(OnboardVenue onboardVenue, EditBeachMap editBeachMap,
			EditVenueProfile editVenueProfile, ViewVenueProfile viewVenueProfile,
			ViewDailyAvailability viewDailyAvailability, CurrentOperator currentOperator) {
		this.onboardVenue = onboardVenue;
		this.editBeachMap = editBeachMap;
		this.editVenueProfile = editVenueProfile;
		this.viewVenueProfile = viewVenueProfile;
		this.viewDailyAvailability = viewDailyAvailability;
		this.currentOperator = currentOperator;
	}

	@PostMapping
	ResponseEntity<Map<String, Object>> create(Authentication authentication,
			@RequestBody CreateVenueRequest request) {
		// Creator-owns-on-create (invariant #13): resolve the authenticated operator and hand it
		// to the service, which records ownership in the same transaction as the insert. Create is still
		// role-gated only (any ACTIVE operator may create) — there is no prior owner to check against.
		OperatorId creator = currentOperator.require(authentication);
		// Conversion wraps here and below: bad request input stays a 400, a service IAE stays a 500.
		var command = InvalidApiRequestException.parsing(request::toCommand);
		VenueId id = onboardVenue.onboard(creator, command);
		return ResponseEntity.created(URI.create("/api/venues/" + id.value()))
				.body(Map.of("id", id.value()));
	}

	@GetMapping("/{venueId}/profile")
	ResponseEntity<VenueProfileResponse> getProfile(Authentication authentication,
			@PathVariable long venueId) {
		// Owner-scoped read (invariant #13): the service asserts ownership before returning the
		// profile (which carries the read-only commission + payout currency) — a non-owner is 403 via
		// ApiErrorHandler. This endpoint is gated to role OPERATOR ABOVE the public "GET /api/venues/**"
		// in SecurityConfig, so it never leaks commission to the anonymous tourist read.
		OperatorId operator = currentOperator.require(authentication);
		return viewVenueProfile.profileFor(operator, new VenueId(venueId))
				.map(VenueProfileResponse::from)
				.map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	/**
	 * The owner's per-set availability states for one day — owner-scoped (invariant #13): the
	 * service asserts ownership before answering, so a venue's hold pattern (online hold vs walk-in
	 * mark) never leaks to a non-owner ({@code 403} via {@code ApiErrorHandler}). Gated to role
	 * OPERATOR ABOVE the public {@code GET /api/venues/**} in {@code SecurityConfig}, like the
	 * profile + takings reads. A free set is absent from the list; an owned-but-vanished venue is
	 * {@code 404 NO_SUCH_VENUE} (the one coded 404 contract this controller already speaks).
	 */
	@GetMapping("/{venueId}/availability")
	ResponseEntity<?> dailyAvailability(Authentication authentication,
			@PathVariable long venueId,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = currentOperator.require(authentication);
		return viewDailyAvailability.statesFor(operator, new VenueId(venueId), date)
				.<ResponseEntity<?>>map(ResponseEntity::ok)
				.orElseGet(() -> ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_VENUE",
						NO_SUCH_VENUE_DETAIL));
	}

	@PatchMapping("/{venueId}")
	ResponseEntity<?> updateProfile(Authentication authentication, @PathVariable long venueId,
			@RequestBody UpdateVenueProfileRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		// ExpectedVersion.require first: a missing token is a 400 (INVALID_REQUEST) before the write,
		// never a silent 0. STALE_WRITE → 409 lets the tab reload the latest values and re-apply.
		long expectedVersion = InvalidApiRequestException
				.parsing(() -> ExpectedVersion.require(request.expectedVersion()));
		var command = InvalidApiRequestException.parsing(request::toCommand);
		return switch (editVenueProfile.updateProfile(operator, new VenueId(venueId),
				expectedVersion, command)) {
			case APPLIED -> ResponseEntity.noContent().build();
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_VENUE",
					NO_SUCH_VENUE_DETAIL);
			case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, "STALE_WRITE",
					"This venue was changed by someone else. Reload the latest values and try again.");
		};
	}

	@PostMapping("/{venueId}/sets")
	ResponseEntity<?> addSet(Authentication authentication, @PathVariable long venueId,
			@RequestBody SetPositionRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		var command = InvalidApiRequestException.parsing(request::toCommand);
		return switch (editBeachMap.addSet(operator, new VenueId(venueId), command)) {
			case AddSetOutcome.Added added -> ResponseEntity
					.created(URI.create("/api/venues/" + venueId + "/sets/" + added.setId().value()))
					.body(Map.of("id", added.setId().value()));
			case AddSetOutcome.Rejected rejected -> error(rejected.reason());
		};
	}

	@PatchMapping("/{venueId}/sets/{setId}")
	ResponseEntity<?> editSet(Authentication authentication, @PathVariable long venueId,
			@PathVariable long setId, @RequestBody SetPositionRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		var command = InvalidApiRequestException.parsing(request::toCommand);
		return toResponse(editBeachMap.editSet(operator, new VenueId(venueId), new SetId(setId), command));
	}

	@DeleteMapping("/{venueId}/sets/{setId}")
	ResponseEntity<?> removeSet(Authentication authentication, @PathVariable long venueId,
			@PathVariable long setId) {
		OperatorId operator = currentOperator.require(authentication);
		return toResponse(editBeachMap.removeSet(operator, new VenueId(venueId), new SetId(setId)));
	}

	@PutMapping("/{venueId}/beach-map")
	ResponseEntity<?> replaceLayout(Authentication authentication, @PathVariable long venueId,
			@RequestBody BeachMapLayoutRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		// ExpectedVersion.require first: a missing token is a 400 (INVALID_REQUEST) before the write,
		// never a silent 0. STALE_WRITE → 409 lets the tab reload the latest map and re-apply.
		long expectedVersion = InvalidApiRequestException
				.parsing(() -> ExpectedVersion.require(request.expectedVersion()));
		var command = InvalidApiRequestException.parsing(request::toCommand);
		return switch (editBeachMap.replaceLayout(operator, new VenueId(venueId),
				expectedVersion, command)) {
			case ReplaceLayoutOutcome.Replaced ignored -> ResponseEntity.noContent().build();
			case ReplaceLayoutOutcome.Rejected rejected -> error(rejected.reason());
		};
	}

	@PutMapping("/{venueId}/rows/{rowLabel}/price")
	ResponseEntity<?> repriceRow(Authentication authentication, @PathVariable long venueId,
			@PathVariable String rowLabel, @RequestBody RowPriceRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		// ExpectedVersion.require first: a missing token is a 400 (INVALID_REQUEST) before the write,
		// never a silent 0. STALE_WRITE → 409 lets the tab reload the latest prices and re-apply.
		long expectedVersion = InvalidApiRequestException
				.parsing(() -> ExpectedVersion.require(request.expectedVersion()));
		var command = InvalidApiRequestException.parsing(() -> request.toCommand(rowLabel));
		return toResponse(editBeachMap.repriceRow(operator, new VenueId(venueId), expectedVersion, command));
	}

	private static ResponseEntity<?> toResponse(ChangeOutcome outcome) {
		return switch (outcome) {
			case ChangeOutcome.Applied ignored -> ResponseEntity.noContent().build();
			case ChangeOutcome.Rejected rejected -> error(rejected.reason());
		};
	}

	private static ResponseEntity<ProblemDetail> error(SetRejection reason) {
		return switch (reason) {
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					NO_SUCH_VENUE_DETAIL);
			case NO_SUCH_SET -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					"No such set.");
			case NO_SUCH_ROW -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					"No set on this venue has that row label.");
			case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"These prices were changed by someone else. Reload the latest and try again.");
			case SET_IN_USE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"This set is booked, or still held, so it can't be moved or removed.");
			case CELL_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Another set already occupies this grid cell.");
			case DUPLICATE_POSITION -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Another set already has this row and position.");
		};
	}

	private static ResponseEntity<ProblemDetail> error(ReplaceRejection reason) {
		return switch (reason) {
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(),
					NO_SUCH_VENUE_DETAIL);
			case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"This layout was changed by someone else. Reload the latest map and try again.");
			case LAYOUT_IN_USE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"This venue has bookings, or sets that are still held, so its layout is locked.");
			case CELL_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Two sets occupy the same grid cell.");
			case DUPLICATE_POSITION -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Two sets share the same row and position.");
			case EMPTY_LAYOUT -> ApiProblem.response(HttpStatus.BAD_REQUEST, reason.name(),
					"A layout must have at least one set.");
			case LAYOUT_TOO_LARGE -> ApiProblem.response(HttpStatus.BAD_REQUEST, reason.name(),
					"The layout exceeds the maximum grid size.");
		};
	}
}
