package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.booking.application.refund.RefundForWeather;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Admin endpoint for the weather refund: full refunds for a washed-out venue+date
 * (invariant #10), regardless of cutoff, via the {@link RefundForWeather} port (invariant #11).
 *
 * <p><strong>Operator-gated</strong>: it moves real money, so never public. {@code SecurityConfig}
 * matches this POST to role {@code OPERATOR} <em>before</em> the public venue rules (anonymous →
 * {@code 401}). {@code date} is <strong>required</strong>: an implicit "today" could refund the
 * wrong day's bookings.
 */
@RestController
@RequestMapping("/api/venues")
class AdminWeatherRefundController {

	private final RefundForWeather refundForWeather;
	private final OperatorDirectory operatorDirectory;

	AdminWeatherRefundController(RefundForWeather refundForWeather, OperatorDirectory operatorDirectory) {
		this.refundForWeather = refundForWeather;
		this.operatorDirectory = operatorDirectory;
	}

	@PostMapping("/{venueId}/weather-refund")
	WeatherRefundView refund(Authentication authentication, @PathVariable long venueId,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = operatorDirectory.requireOperator(authentication.getName());
		return WeatherRefundView.of(
				refundForWeather.refundForWeather(operator, new VenueId(venueId), date));
	}
}
