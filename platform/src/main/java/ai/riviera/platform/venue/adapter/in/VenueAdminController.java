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
import ai.riviera.platform.venue.vocabulary.LayoutRejection;
import ai.riviera.platform.venue.application.SetBatchOutcome;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.application.ViewBeachMap;
import ai.riviera.platform.venue.application.ViewDailyAvailability;
import ai.riviera.platform.venue.application.ViewVenueProfile;

/**
 * The operator's venue console (onboarding, beach-map and profile edits, the owner's reads) on the
 * module's ports only (invariant #11), behind role {@code OPERATOR} in {@code SecurityConfig}. Each
 * {@code venueId} call hands the resolved {@link OperatorId} to a port that asserts ownership
 * before acting (invariant #13, {@code 403} via {@code ApiErrorHandler}); {@code create} records
 * the creator as owner. Outcomes map to HTTP by exhaustive {@code switch}; malformed input (400)
 * and the {@code DuplicateKeyException} race backstop (409) map centrally in {@code ApiErrorHandler}.
 */
@RestController
@RequestMapping("/api/venues")
class VenueAdminController {

	/** The bulk save's set-naming refusal and the extension property carrying the named sets. */
	private static final String SETS_IN_USE_CODE = "SETS_IN_USE";
	private static final String SETS_PROPERTY = "sets";

	/** The 404 code and detail shared by every NO_SUCH_VENUE outcome (profile write, owner reads, beach-map edits). */
	private static final String NO_SUCH_VENUE_CODE = "NO_SUCH_VENUE";
	private static final String NO_SUCH_VENUE_DETAIL = "No such venue.";

	/**
	 * The profile write's STALE_WRITE detail, on the {@code venue.version} token (V22).
	 * A detail states the condition, not the remedy: {@code riviera-java-conventions}
	 * {@code references/error-contract.md}.
	 */
	private static final String STALE_PROFILE_DETAIL =
			"The venue profile has changed since the version this request carries.";

	/**
	 * The STALE_WRITE detail shared by every token-guarded set-write — the row reprice, the row
	 * rename, the batch apply and the bulk layout replace turn on one {@code venue.set_version}
	 * token (V23), so any can lose to another and the wording may attribute the change to none.
	 */
	private static final String STALE_SETS_DETAIL =
			"This venue's sets have changed since the version this request carries.";

	private final OnboardVenue onboardVenue;
	private final EditBeachMap editBeachMap;
	private final EditVenueProfile editVenueProfile;
	private final ViewVenueProfile viewVenueProfile;
	private final ViewDailyAvailability viewDailyAvailability;
	private final ViewBeachMap viewBeachMap;
	private final CurrentOperator currentOperator;

	VenueAdminController(OnboardVenue onboardVenue, EditBeachMap editBeachMap,
			EditVenueProfile editVenueProfile, ViewVenueProfile viewVenueProfile,
			ViewDailyAvailability viewDailyAvailability, ViewBeachMap viewBeachMap,
			CurrentOperator currentOperator) {
		this.onboardVenue = onboardVenue;
		this.editBeachMap = editBeachMap;
		this.editVenueProfile = editVenueProfile;
		this.viewVenueProfile = viewVenueProfile;
		this.viewDailyAvailability = viewDailyAvailability;
		this.viewBeachMap = viewBeachMap;
		this.currentOperator = currentOperator;
	}

	@PostMapping
	ResponseEntity<Map<String, Object>> create(Authentication authentication,
			@RequestBody CreateVenueRequest request) {
		// Creator-owns-on-create (invariant #13): resolve the authenticated operator and hand it
		// to the service, which records ownership in the same transaction as the insert. Create is still
		// role-gated only (any resolvable operator may create) — there is no prior owner to check against.
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
	 * The owner's per-set states for a day, a free set absent; ownership is asserted before existence
	 * (invariant #13: {@code 403}, then {@code 404 NO_SUCH_VENUE}) so the hold pattern never leaks.
	 * Keep its OPERATOR rule ABOVE the public {@code GET /api/venues/**} in {@code SecurityConfig}.
	 */
	@GetMapping("/{venueId}/availability")
	ResponseEntity<?> dailyAvailability(Authentication authentication,
			@PathVariable long venueId,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = currentOperator.require(authentication);
		return viewDailyAvailability.statesFor(operator, new VenueId(venueId), date)
				.<ResponseEntity<?>>map(ResponseEntity::ok)
				.orElseGet(() -> ApiProblem.response(HttpStatus.NOT_FOUND, NO_SUCH_VENUE_CODE,
						NO_SUCH_VENUE_DETAIL));
	}

	/**
	 * The owner's beach map plus a lock entry per set a live claim pins; ownership is asserted before
	 * existence (invariant #13, {@code 403}); a venue the map read misses is {@code 404 NO_SUCH_VENUE}.
	 * Keep its OPERATOR rule ABOVE the public {@code GET /api/venues/**} in {@code SecurityConfig}.
	 */
	@GetMapping("/{venueId}/beach-map")
	ResponseEntity<?> beachMap(Authentication authentication, @PathVariable long venueId) {
		OperatorId operator = currentOperator.require(authentication);
		return viewBeachMap.beachMapFor(operator, new VenueId(venueId))
				.<ResponseEntity<?>>map(beachMap -> ResponseEntity.ok(OperatorBeachMapView.of(beachMap)))
				.orElseGet(() -> ApiProblem.response(HttpStatus.NOT_FOUND, NO_SUCH_VENUE_CODE,
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
			case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, NO_SUCH_VENUE_CODE,
					NO_SUCH_VENUE_DETAIL);
			case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, "STALE_WRITE",
					STALE_PROFILE_DETAIL);
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

	@PatchMapping("/{venueId}/sets")
	ResponseEntity<?> applyToSets(Authentication authentication, @PathVariable long venueId,
			@RequestBody SetBatchRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		// A missing token is a 400 before the write, never a silent 0 — as on the replace below.
		long expectedVersion = InvalidApiRequestException
				.parsing(() -> ExpectedVersion.require(request.expectedVersion()));
		var command = InvalidApiRequestException.parsing(request::toCommand);
		return switch (editBeachMap.applyToSets(operator, new VenueId(venueId), expectedVersion, command)) {
			case SetBatchOutcome.Applied applied -> ResponseEntity.ok(Map.of("updated", applied.updated()));
			case SetBatchOutcome.Rejected rejected -> error(rejected.reason());
		};
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
			case ReplaceLayoutOutcome.SetsInUse inUse -> setsInUse(inUse);
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

	@PutMapping("/{venueId}/rows/{rowLabel}/name")
	ResponseEntity<?> renameRow(Authentication authentication, @PathVariable long venueId,
			@PathVariable String rowLabel, @RequestBody RowNameRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		// A missing token is a 400 before the write, never a silent 0 — as on the reprice above.
		long expectedVersion = InvalidApiRequestException
				.parsing(() -> ExpectedVersion.require(request.expectedVersion()));
		var command = InvalidApiRequestException.parsing(() -> request.toCommand(rowLabel));
		return toResponse(editBeachMap.renameRow(operator, new VenueId(venueId), expectedVersion, command));
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
					STALE_SETS_DETAIL);
			case SET_IN_USE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"This set has a booking or a current hold.");
			case CELL_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Another set already occupies this grid cell.");
			case DUPLICATE_POSITION -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Another set already has this row and position.");
			case ROW_NAME_TAKEN -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(),
					"Another row on this venue already has that name.");
		};
	}

	/**
	 * The one layout refusal that names sets: {@code 409 SETS_IN_USE} with a {@code sets} extension
	 * listing every removed set a live claim pins, so the editor can mark them.
	 */
	private static ResponseEntity<ProblemDetail> setsInUse(ReplaceLayoutOutcome.SetsInUse inUse) {
		ProblemDetail problem = ApiProblem.of(HttpStatus.CONFLICT, SETS_IN_USE_CODE,
				"Sets this save would remove are booked or held.");
		problem.setProperty(SETS_PROPERTY, inUse.sets().stream().map(BlockedSetView::of).toList());
		return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
	}

	private static ResponseEntity<ProblemDetail> error(LayoutRejection reason) {
		return ApiProblem.response(statusOf(reason.fault()), reason.name(), reason.detail());
	}

	private static HttpStatus statusOf(LayoutRejection.Fault fault) {
		return switch (fault) {
			case NOT_FOUND -> HttpStatus.NOT_FOUND;
			case CONFLICT -> HttpStatus.CONFLICT;
			case INVALID -> HttpStatus.BAD_REQUEST;
		};
	}
}
