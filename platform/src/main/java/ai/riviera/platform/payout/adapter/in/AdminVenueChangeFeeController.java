package ai.riviera.platform.payout.adapter.in;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payout.application.VenueChangeFeeSetting;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * The platform-admin venue-change-fee surface: what the fee is now, and the write that changes it.
 * Driving adapter depending only on the module's {@link VenueChangeFeeSetting} port; hosted in the
 * module like the other module-owned admin surfaces.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> The fee is one platform-wide commercial term, so
 * there is nothing for object-level authorization to check. Living under {@code /api/admin/**} takes
 * the invariant-#13 exemption, and the {@code ADMIN} gate in {@code SecurityConfig} is then the
 * <strong>whole</strong> authorization: a plain {@code OPERATOR} is {@code 403}, anonymous
 * {@code 401}.
 *
 * <p><strong>A change is forward-only in effect, never retroactive.</strong> It applies to every fee
 * charged after it; posted {@code FEE} ledger rows are history and are not repriced. The one window
 * this leaves — a write landing between a remodel commit and the asynchronous charge it will cause —
 * is documented in {@code RESPONSIBILITIES.md} §{@code payout}.
 *
 * <p>Errors are the one RFC-7807 contract: a missing or out-of-range amount is
 * {@code 400 INVALID_REQUEST} via {@link InvalidApiRequestException#parsing} at the conversion
 * boundary. The audit record is written at the edge for every mutating {@code /api/admin/**} action,
 * so there is no instrumentation here.
 */
@RestController
@RequestMapping("/api/admin/venue-change-fee")
class AdminVenueChangeFeeController {

	private final VenueChangeFeeSetting setting;

	AdminVenueChangeFeeController(VenueChangeFeeSetting setting) {
		this.setting = setting;
	}

	@GetMapping
	VenueChangeFeeView fee() {
		return VenueChangeFeeView.of(setting.current());
	}

	@PutMapping
	VenueChangeFeeView setFee(@RequestBody SetVenueChangeFeeRequest request) {
		long amountMinor = InvalidApiRequestException.parsing(request::toMinorUnits);
		return VenueChangeFeeView.of(setting.change(amountMinor));
	}
}
