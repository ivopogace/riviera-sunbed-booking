package ai.riviera.platform;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import ai.riviera.platform.availability.application.MarkOutcome;
import ai.riviera.platform.availability.application.ReleaseOutcome;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.view.ListDailyBookings;
import ai.riviera.platform.booking.application.refund.RefundForWeather;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.application.VenueLedger;
import ai.riviera.platform.payout.application.ViewPayoutLedger;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.StripeWebhookEvents;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.adapter.out.StripeProperties;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;
import ai.riviera.platform.venue.application.AddSetOutcome;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.OnboardVenue;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;

/**
 * Shared collaborators for {@code @WebMvcTest} slices that load the whole web layer (the CORS/security
 * filter-chain test and the rate-limit tests). The web slice registers every {@code @RestController}
 * but no {@code @Repository}/{@code @Service} beans, so each controller's ports are stubbed here once
 * instead of being copied into every test. The booking ports resolve an allowed request to a
 * {@code 404} (unknown set/code) — so in the rate-limit tests a {@code 429} is unambiguously the
 * limiter. The {@link Clock} is fixed: the filter tests exercise capacity, not refill (refill is
 * pinned purely by {@code TokenBucketTest}).
 */
@TestConfiguration(proxyBeanMethods = false)
class WebSliceStubs {

	/** Stamp a client IP onto a MockMvc request (shared by the rate-limit slices). */
	static RequestPostProcessor fromIp(String ip) {
		return request -> {
			request.setRemoteAddr(ip);
			return request;
		};
	}

	@Bean
	CreateBooking createBooking() {
		return command -> BookingOutcome.Rejected.NO_SUCH_SET;
	}

	@Bean
	ViewBooking viewBooking() {
		return code -> Optional.empty();
	}

	@Bean
	CancelBooking cancelBooking() {
		return code -> new CancelOutcome.NotFound();
	}

	@Bean
	Clock clock() {
		return Clock.fixed(Instant.parse("2026-06-30T12:00:00Z"), ZoneOffset.UTC);
	}

	/** Resolve any principal to a fixed operator id — the web slices don't exercise ownership. */
	@Bean
	OperatorDirectory operatorDirectory() {
		return username -> Optional.of(new OperatorId(1));
	}

	/**
	 * Credential store for the edge {@code UserDetailsService} imported via {@code SecurityConfig}
	 * (#74). The web slices only hit permit-all endpoints / preflights, never an authenticated login,
	 * so an empty store is enough — no operator can be authenticated here.
	 */
	@Bean
	OperatorAccounts operatorAccounts() {
		return username -> Optional.empty();
	}

	/** Same-package (root) construction reaches {@code CurrentOperator}'s package-private constructor. */
	@Bean
	CurrentOperator currentOperator(OperatorDirectory operatorDirectory) {
		return new CurrentOperator(operatorDirectory);
	}

	@Bean
	ListDailyBookings listDailyBookings() {
		return (operator, venueId, date) -> List.of();
	}

	@Bean
	RefundForWeather refundForWeather() {
		return (operator, venueId, date) -> new WeatherRefundOutcome(0, 0, "EUR");
	}

	@Bean
	ViewPayoutLedger viewPayoutLedger() {
		return (operator, venueId) -> new VenueLedger(venueId, "EUR", 0, List.of());
	}

	@Bean
	PayoutReport payoutReport() {
		return new PayoutReport() {
			@Override
			public List<ai.riviera.platform.payout.domain.PayoutBatch> generate(
					ai.riviera.platform.payout.domain.PeriodKey period) {
				return List.of();
			}

			@Override
			public List<ai.riviera.platform.payout.domain.PayoutBatch> forPeriod(
					ai.riviera.platform.payout.domain.PeriodKey period) {
				return List.of();
			}

			@Override
			public BatchStatusOutcome mark(long batchId,
					ai.riviera.platform.payout.domain.BatchStatus target) {
				return new BatchStatusOutcome.NotFound();
			}
		};
	}

	@Bean
	StaffAvailability staffAvailability() {
		return new StaffAvailability() {
			@Override
			public MarkOutcome mark(OperatorId operator, SetId setId, LocalDate date) {
				return MarkOutcome.NO_SUCH_SET;
			}

			@Override
			public ReleaseOutcome release(OperatorId operator, SetId setId, LocalDate date) {
				return ReleaseOutcome.NOT_MARKED;
			}
		};
	}

	@Bean
	VenueCatalog venueCatalog() {
		return new VenueCatalog() {
			@Override
			public Optional<VenueMapView> findVenueMap(VenueId id, LocalDate date) {
				return Optional.empty();
			}

			@Override
			public List<VenueSummaryView> listVenues(VenueFilter filter, LocalDate date) {
				return List.of();
			}
		};
	}

	@Bean
	SetBookingFacts setBookingFacts() {
		return new SetBookingFacts() {
			@Override
			public Optional<String> poolOf(SetId setId) {
				return Optional.empty();
			}

			@Override
			public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
				return Optional.empty();
			}
		};
	}

	@Bean
	VenueRates venueRates() {
		return new VenueRates() {
			@Override
			public OptionalInt commissionBps(VenueId id) {
				return OptionalInt.empty();
			}

			@Override
			public OptionalInt lateCancelRefundBps(VenueId id) {
				return OptionalInt.empty();
			}
		};
	}

	@Bean
	Payments payments() {
		return new Payments() {
			@Override
			public void register(NewPayment payment) {
			}

			@Override
			public Optional<BookingRef> findBookingRefByIntent(String paymentIntentId) {
				return Optional.empty();
			}

			@Override
			public void markStatus(String paymentIntentId, PaymentStatus status) {
			}

			@Override
			public Optional<String> findIntentByBookingRef(BookingRef booking) {
				return Optional.empty();
			}

			@Override
			public void markRefunded(BookingRef booking, long refundedMinor, String refundId) {
			}
		};
	}

	@Bean
	StripeWebhookEvents stripeWebhookEvents() {
		return (eventId, eventType) -> true;
	}

	@Bean
	StripeProperties stripeProperties() {
		return new StripeProperties("", "whsec_test", null, null);
	}

	@Bean
	OnboardVenue onboardVenue() {
		return command -> new VenueId(0);
	}

	@Bean
	EditBeachMap editBeachMap() {
		return new EditBeachMap() {
			@Override
			public AddSetOutcome addSet(OperatorId operator, VenueId venueId, SetCommand command) {
				return new AddSetOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}

			@Override
			public ChangeOutcome editSet(OperatorId operator, VenueId venueId, SetId setId, SetCommand command) {
				return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}

			@Override
			public ChangeOutcome removeSet(OperatorId operator, VenueId venueId, SetId setId) {
				return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}
		};
	}
}
