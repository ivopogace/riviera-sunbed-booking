package ai.riviera.platform.payout.adapter.in;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.payout.application.VenueChangeFeeSetting;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * The platform-admin venue-change-fee surface: read the fee, and change it, via the
 * {@link VenueChangeFeeSetting} port (which documents what a change reaches).
 *
 * <p>One platform-wide term, so not venue-scoped: the {@code SecurityConfig} {@code ADMIN} gate is
 * the whole authorization (#13 exempts {@code /api/admin/**}); {@code OPERATOR} gets {@code 403},
 * anonymous {@code 401}. A missing or out-of-range amount is {@code 400 INVALID_REQUEST} via
 * {@link InvalidApiRequestException#parsing}. The edge writes the audit record, not this class.
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
