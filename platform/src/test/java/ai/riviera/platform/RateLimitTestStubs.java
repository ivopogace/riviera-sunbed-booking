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

import ai.riviera.platform.availability.application.in.MarkOutcome;
import ai.riviera.platform.availability.application.in.ReleaseOutcome;
import ai.riviera.platform.availability.application.in.StaffAvailability;
import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.CancelBooking;
import ai.riviera.platform.booking.application.in.CancelOutcome;
import ai.riviera.platform.booking.application.in.CreateBooking;
import ai.riviera.platform.booking.application.in.ListDailyBookings;
import ai.riviera.platform.booking.application.in.ViewBooking;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.application.out.NewPayment;
import ai.riviera.platform.payment.application.out.Payments;
import ai.riviera.platform.payment.application.out.StripeWebhookEvents;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.infrastructure.StripeProperties;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueFilter;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.api.VenueMapView;
import ai.riviera.platform.venue.api.VenueSummaryView;
import ai.riviera.platform.venue.application.in.AddSetOutcome;
import ai.riviera.platform.venue.application.in.ChangeOutcome;
import ai.riviera.platform.venue.application.in.EditBeachMap;
import ai.riviera.platform.venue.application.in.OnboardVenue;
import ai.riviera.platform.venue.application.in.SetCommand;
import ai.riviera.platform.venue.application.in.SetRejection;

/**
 * Collaborators for the {@code @WebMvcTest} rate-limit slices (issue #56). The web slice registers
 * every {@code @RestController} but no {@code @Repository}/{@code @Service} beans, so each controller's
 * ports are stubbed here (mirroring {@code WebCorsConfigTest}). The rate-limit tests only ever hit the
 * booking endpoints, where an allowed request resolves to a {@code 404} (unknown set/code) — so a
 * {@code 429} is unambiguously the limiter. The {@link Clock} is fixed: the filter tests exercise
 * capacity, not refill (refill is pinned purely by {@code TokenBucketTest}).
 */
@TestConfiguration(proxyBeanMethods = false)
class RateLimitTestStubs {

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

	@Bean
	ListDailyBookings listDailyBookings() {
		return (venueId, date) -> List.of();
	}

	@Bean
	StaffAvailability staffAvailability() {
		return new StaffAvailability() {
			@Override
			public MarkOutcome mark(SetId setId, LocalDate date) {
				return MarkOutcome.NO_SUCH_SET;
			}

			@Override
			public ReleaseOutcome release(SetId setId, LocalDate date) {
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

			@Override
			public Optional<String> poolOf(SetId setId) {
				return Optional.empty();
			}

			@Override
			public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
				return Optional.empty();
			}

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
			public AddSetOutcome addSet(VenueId venueId, SetCommand command) {
				return new AddSetOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}

			@Override
			public ChangeOutcome editSet(VenueId venueId, SetId setId, SetCommand command) {
				return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}

			@Override
			public ChangeOutcome removeSet(VenueId venueId, SetId setId) {
				return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}
		};
	}
}
