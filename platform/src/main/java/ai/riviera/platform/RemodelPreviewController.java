package ai.riviera.platform;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.api.BeachMapRemodel;
import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.LayoutPreview;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The remodel preview: a dry run of the bulk beach-map save that answers what it would do to every
 * live claim, without writing. Lives at the platform edge because it composes two modules that may
 * not see each other — {@code venue} diffs the cells and names the disturbed sets with their
 * walk-in holds, {@code booking} classifies the live bookings on them — and only the root may reach
 * both (ADR-0020). Each port asserts venue ownership itself (invariant #13); the edge resolves the
 * principal, maps the rejections and assembles the five groups plus {@code keep}.
 *
 * <p>The outcome→HTTP map: a preview → {@code 200}; {@code NO_SUCH_VENUE} → {@code 404};
 * {@code STALE_WRITE} → {@code 409}; a non-owner → {@code 403} via {@code ApiErrorHandler}. The
 * answer is a snapshot: the save re-decides under its locks, and today refuses any disturbed set a
 * live claim pins.
 */
@RestController
@RequestMapping("/api/venues")
class RemodelPreviewController {

	/** The venue module's wording for the same codes: one {@code set_version} token, one sentence. */
	private static final String NO_SUCH_VENUE_DETAIL = "No such venue.";
	private static final String STALE_SETS_DETAIL =
			"This venue's sets have changed since the version this request carries.";

	private final CurrentOperator currentOperator;
	private final BeachMapRemodel remodel;
	private final RemodelClaims claims;

	RemodelPreviewController(CurrentOperator currentOperator, BeachMapRemodel remodel, RemodelClaims claims) {
		this.currentOperator = currentOperator;
		this.remodel = remodel;
		this.claims = claims;
	}

	@PostMapping("/{venueId}/beach-map/preview")
	ResponseEntity<?> preview(Authentication authentication, @PathVariable long venueId,
			@RequestBody RemodelPreviewRequest request) {
		OperatorId operator = currentOperator.require(authentication);
		long expectedVersion = InvalidApiRequestException.parsing(request::requireExpectedVersion);
		var cells = InvalidApiRequestException.parsing(request::toPlacements);
		VenueId venue = new VenueId(venueId);
		return switch (remodel.preview(operator, venue, expectedVersion, cells)) {
			case LayoutPreview.Disturbing disturbing -> ResponseEntity.ok(assemble(operator, venue, disturbing.sets()));
			case LayoutPreview.Rejected(var reason) -> switch (reason) {
				case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, reason.name(), NO_SUCH_VENUE_DETAIL);
				case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, reason.name(), STALE_SETS_DETAIL);
			};
		};
	}

	private RemodelPreviewResponse assemble(OperatorId operator, VenueId venue, List<DisturbedSet> disturbed) {
		List<RemodelClaim> classified = disturbed.isEmpty() ? List.of()
				: claims.classify(operator, venue, disturbed.stream().map(DisturbedSet::setId).toList());
		List<RemodelPreviewResponse.MoveView> moves = new ArrayList<>();
		List<RemodelPreviewResponse.ClaimView> refunds = new ArrayList<>();
		List<RemodelPreviewResponse.ReleaseView> releases = new ArrayList<>();
		List<RemodelPreviewResponse.BlockView> blocks = new ArrayList<>();
		Map<SetId, RemodelPreviewResponse.SpotView> keep = new TreeMap<>(Comparator.comparingLong(SetId::value));
		for (RemodelClaim claim : classified) {
			long id = claim.bookingId().value();
			String date = claim.bookingDate().toString();
			MoneyView amount = new MoneyView(claim.amountMinor(), claim.currency());
			RemodelPreviewResponse.SpotView from = spot(claim.from());
			switch (claim.outcome()) {
				case RemodelOutcome.Move(var to, var rowsAway, var positionsAway) ->
					moves.add(new RemodelPreviewResponse.MoveView(id, date, amount, from, spot(to), rowsAway,
							positionsAway));
				case RemodelOutcome.Refund ignored ->
					refunds.add(new RemodelPreviewResponse.ClaimView(id, date, amount, from));
				case RemodelOutcome.Release release ->
					releases.add(new RemodelPreviewResponse.ReleaseView(id, date, amount, from, release.name()));
				case RemodelOutcome.Decline decline ->
					releases.add(new RemodelPreviewResponse.ReleaseView(id, date, amount, from, decline.name()));
				case RemodelOutcome.Blocked(var reason) -> {
					blocks.add(new RemodelPreviewResponse.BlockView(id, date, amount, from, reason.name()));
					keep.put(claim.from().setId(), from);
				}
			}
		}
		List<RemodelPreviewResponse.StaffHoldView> staffHolds = new ArrayList<>();
		for (DisturbedSet set : disturbed) {
			if (!set.walkInHolds().isEmpty()) {
				RemodelPreviewResponse.SpotView spot = new RemodelPreviewResponse.SpotView(set.setId().value(),
						set.placement().rowLabel(), set.placement().positionNo());
				staffHolds.add(new RemodelPreviewResponse.StaffHoldView(spot,
						set.walkInHolds().stream().map(Object::toString).toList()));
				keep.put(set.setId(), spot);
			}
		}
		return new RemodelPreviewResponse(moves, refunds, releases, staffHolds, blocks, List.copyOf(keep.values()));
	}

	private static RemodelPreviewResponse.SpotView spot(SpotRef ref) {
		return new RemodelPreviewResponse.SpotView(ref.setId().value(), ref.rowLabel(), ref.positionNo());
	}
}
