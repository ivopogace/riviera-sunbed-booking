package ai.riviera.platform;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
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
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.ExpireRequests;
import ai.riviera.platform.booking.application.request.PendingRequests;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.application.view.MyBookings;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.customer.vocabulary.VerifyEmailOutcome;
import java.util.Map;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.api.OperatorRegistration;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;
import ai.riviera.platform.operator.vocabulary.PendingOperator;
import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.DailyTakingsView;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.application.VenueLedger;
import ai.riviera.platform.payout.application.ViewDailyTakings;
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
import ai.riviera.platform.venue.application.EditVenueProfile;
import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.ListOwnedVenues;
import ai.riviera.platform.venue.application.OnboardVenue;
import ai.riviera.platform.venue.application.ProfileUpdateOutcome;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.ReplaceRejection;
import ai.riviera.platform.venue.application.PhotoProcessingResult;
import ai.riviera.platform.venue.application.PhotoUploadResult;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.application.StoredBytes;
import ai.riviera.platform.venue.application.VenuePhotos;
import ai.riviera.platform.venue.application.ViewVenueProfile;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;

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

	/** #98 Request-to-Book web-slice stubs: the controller/scheduler ports with inert defaults. */
	@Bean
	PendingRequests pendingRequests() {
		return (_, _) -> List.of();
	}

	@Bean
	RespondToRequest respondToRequest() {
		return new RespondToRequest() {
			@Override
			public AcceptOutcome accept(OperatorId operator,
					VenueId venueId,
					BookingId bookingId) {
				return AcceptOutcome.Rejected.NO_SUCH_REQUEST;
			}

			@Override
			public DeclineOutcome decline(OperatorId operator,
					VenueId venueId,
					BookingId bookingId) {
				return DeclineOutcome.Rejected.NO_SUCH_REQUEST;
			}
		};
	}

	@Bean
	ExpireRequests expireRequests() {
		return () -> 0;
	}


	/** Stamp a client IP onto a MockMvc request (shared by the rate-limit slices). */
	static RequestPostProcessor fromIp(String ip) {
		return request -> {
			request.setRemoteAddr(ip);
			return request;
		};
	}

	@Bean
	CreateBooking createBooking() {
		return _ -> BookingOutcome.Rejected.NO_SUCH_SET;
	}

	@Bean
	ViewBooking viewBooking() {
		return _ -> Optional.empty();
	}

	@Bean
	CancelBooking cancelBooking() {
		return _ -> new CancelOutcome.NotFound();
	}

	@Bean
	Clock clock() {
		return Clock.fixed(Instant.parse("2026-06-30T12:00:00Z"), ZoneOffset.UTC);
	}

	/** Resolve any principal to a fixed operator id — the web slices don't exercise ownership. */
	@Bean
	OperatorDirectory operatorDirectory() {
		return _ -> Optional.of(new OperatorId(1));
	}

	/**
	 * Credential store for the edge {@code UserDetailsService} imported via {@code SecurityConfig}
	 * (#74). The web slices only hit permit-all endpoints / preflights, never an authenticated login,
	 * so an empty store is enough — no operator can be authenticated here.
	 */
	@Bean
	OperatorAccounts operatorAccounts() {
		return _ -> Optional.empty();
	}

	/**
	 * Customer account ports (S2 #111) that {@code SecurityConfig}'s {@code customerAuthenticationManager}
	 * and {@code AuthController} require. Empty/inert like the operator store: the web slices never
	 * authenticate or actually create a customer, so an empty credential store + an always-already-taken
	 * registration are enough for the context to load and for a rate-limit attempt to reach the limiter.
	 */
	@Bean
	CustomerAccounts customerAccounts() {
		return _ -> Optional.empty();
	}

	@Bean
	CustomerAccountProvisioning customerAccountProvisioning() {
		return (_, _) -> new RegistrationOutcome.AlreadyRegistered();
	}

	/**
	 * #101 [D5] right-to-erasure port that {@code MyErasureController} + {@code AdminErasureController}
	 * register with. Inert (nothing to erase): the shared web slices never drive a real erasure, so a
	 * {@code NOT_FOUND} is enough for the context to load. {@code MeErasureControllerTest} /
	 * {@code AdminErasureControllerTest} replace this bean to drive the flow.
	 */
	@Bean
	AccountErasure accountErasure() {
		return new AccountErasure() {
			@Override
			public EraseOutcome eraseAccount(CustomerAccountId accountId) {
				return EraseOutcome.NOT_FOUND;
			}

			@Override
			public EraseOutcome eraseByEmail(String email) {
				return EraseOutcome.NOT_FOUND;
			}
		};
	}

	@Bean
	OperatorRegistration operatorRegistration() {
		return (_, _, _) -> new OperatorRegistrationOutcome.AlreadyRegistered();
	}

	@Bean
	OperatorLifecycle operatorLifecycle() {
		return new OperatorLifecycle() {
			@Override
			public java.util.List<PendingOperator> pending() {
				return java.util.List.of();
			}

			@Override
			public java.util.List<OperatorAccount> accounts() {
				return java.util.List.of();
			}

			@Override
			public ApprovalOutcome approve(OperatorId operatorId) {
				return ApprovalOutcome.NO_SUCH_OPERATOR;
			}

			@Override
			public ApprovalOutcome reject(OperatorId operatorId) {
				return ApprovalOutcome.NO_SUCH_OPERATOR;
			}

			@Override
			public OperatorLifecycleOutcome suspend(OperatorId operatorId) {
				return new OperatorLifecycleOutcome.NoSuchOperator();
			}

			@Override
			public OperatorLifecycleOutcome reinstate(OperatorId operatorId) {
				return new OperatorLifecycleOutcome.NoSuchOperator();
			}
		};
	}

	/** Same-package (root) construction reaches {@code CurrentOperator}'s package-private constructor. */
	@Bean
	CurrentOperator currentOperator(OperatorDirectory operatorDirectory) {
		return new CurrentOperator(operatorDirectory);
	}

	/**
	 * S3 (#114): the customer account-id resolver + the edge helper that {@code BookingController}
	 * (signed-in checkout link) and {@code MyBookingsController} (my-bookings) now depend on. Inert:
	 * the web slices hit permit-all / role-gated paths, never resolving a real account.
	 */
	@Bean
	CustomerAccountDirectory customerAccountDirectory() {
		return _ -> Optional.empty();
	}

	@Bean
	CurrentCustomer currentCustomer(CustomerAccountDirectory customerAccountDirectory) {
		return new CurrentCustomer(customerAccountDirectory);
	}

	/**
	 * S4 (#112): the edge SSO ports {@code SsoController} requires. Inert — the web slices (CORS +
	 * rate-limit) never drive the SSO redirect/callback, so a pass-through gateway + a fixed account id
	 * are enough for the context to load and for a rate-limit attempt to reach the limiter.
	 */
	@Bean
	SsoGateway ssoGateway() {
		return new SsoGateway() {
			@Override
			public URI authorizationRequest(SsoProvider provider, SsoAuthorizationChallenge challenge, URI redirectUri) {
				return redirectUri;
			}

			@Override
			public ExternalIdentity exchangeCode(SsoProvider provider, String code, String codeVerifier, URI redirectUri) {
				return new ExternalIdentity(provider, "web-slice-subject", "web-slice@example.com");
			}
		};
	}

	@Bean
	SsoAccountProvisioning ssoAccountProvisioning() {
		return (_, _, _) -> new CustomerAccountId(0);
	}

	/**
	 * S8 (#113): the edge account-recovery collaborators the recovery/set-password controllers +
	 * {@code AuthController} depend on. All inert — the web slices (CORS + rate-limit) never redeem a token,
	 * send mail, or revoke a session, so an always-invalid recovery port, a no-op mailer, and an
	 * empty-session repository are enough for the context to load and for a rate-limit attempt to reach the
	 * limiter. {@code RecoveryProperties} + {@code Clock} come from {@code SecurityConfig}'s
	 * {@code @EnableConfigurationProperties} and the fixed {@link #clock()} bean above.
	 */
	@Bean
	Mailer mailer() {
		return new Mailer() {
			@Override
			public void sendEmailVerification(String toEmail, URI verificationLink) {
			}

			@Override
			public void sendPasswordReset(String toEmail, URI resetLink) {
			}
		};
	}

	@Bean
	CustomerAccountRecovery customerAccountRecovery() {
		return new CustomerAccountRecovery() {
			@Override
			public void issueEmailVerificationToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt) {
			}

			@Override
			public void issuePasswordResetToken(CustomerAccountId accountId, String tokenHash, Instant expiresAt) {
			}

			@Override
			public VerifyEmailOutcome verifyEmail(String tokenHash) {
				return new VerifyEmailOutcome.InvalidOrExpired();
			}

			@Override
			public ResetPasswordOutcome resetPassword(String tokenHash, String newPasswordHash) {
				return new ResetPasswordOutcome.InvalidOrExpired();
			}

			@Override
			public void setPassword(CustomerAccountId accountId, String newPasswordHash) {
			}

			@Override
			public boolean isEmailVerified(CustomerAccountId accountId) {
				return false;
			}
		};
	}

	@Bean
	RecoveryTokens recoveryTokens() {
		return new RecoveryTokens();
	}

	@Bean
	CustomerRecovery customerRecovery(CustomerAccountRecovery recovery, Mailer mailer,
			RecoveryTokens recoveryTokens, RecoveryProperties recoveryProperties, Clock clock) {
		return new CustomerRecovery(recovery, mailer, recoveryTokens, recoveryProperties, clock);
	}

	/** An empty session repository — the web slices never revoke a session. */
	@Bean
	FindByIndexNameSessionRepository<? extends Session> sessionRepository() {
		return new FindByIndexNameSessionRepository<>() {
			@Override
			public Session createSession() {
				return null;
			}

			@Override
			public void save(Session session) {
			}

			@Override
			public Session findById(String id) {
				return null;
			}

			@Override
			public void deleteById(String id) {
			}

			@Override
			public Map<String, Session> findByIndexNameAndIndexValue(String indexName, String indexValue) {
				return Map.of();
			}
		};
	}

	@Bean
	PrincipalSessionRevoker principalSessionRevoker(FindByIndexNameSessionRepository<? extends Session> sessions) {
		return new PrincipalSessionRevoker(sessions);
	}

	@Bean
	MyBookings myBookings() {
		return _ -> List.of();
	}

	@Bean
	ListDailyBookings listDailyBookings() {
		return (_, _, _) -> List.of();
	}

	@Bean
	RefundForWeather refundForWeather() {
		return (_, _, _) -> new WeatherRefundOutcome(0, 0, "EUR");
	}

	@Bean
	ViewPayoutLedger viewPayoutLedger() {
		return (_, venueId) -> new VenueLedger(venueId, "EUR", 0, List.of());
	}

	/** #171 console takings read: an inert zero figure — the web slices don't exercise the amount. */
	@Bean
	ViewDailyTakings viewDailyTakings() {
		return (_, _, date) -> new DailyTakingsView(0, 0, 0, 0, "EUR", date);
	}

	@Bean
	PayoutReport payoutReport() {
		return new PayoutReport() {
			@Override
			public List<PayoutBatch> generate(PeriodKey period) {
				return List.of();
			}

			@Override
			public List<PayoutBatch> forPeriod(PeriodKey period) {
				return List.of();
			}

			@Override
			public BatchStatusOutcome mark(long batchId, BatchStatus target) {
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
			public Optional<PaymentCredentials> findPendingCredentials(
					BookingRef booking) {
				return Optional.empty();
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
		return (_, _) -> true;
	}

	@Bean
	StripeProperties stripeProperties() {
		return new StripeProperties("", "whsec_test", null, null);
	}

	@Bean
	OnboardVenue onboardVenue() {
		return (operator, command) -> new VenueId(0);
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

			@Override
			public ReplaceLayoutOutcome replaceLayout(OperatorId operator, VenueId venueId,
					long expectedVersion, LayoutCommand command) {
				return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.NO_SUCH_VENUE);
			}

			@Override
			public ChangeOutcome repriceRow(OperatorId operator, VenueId venueId, long expectedVersion,
					ai.riviera.platform.venue.application.RowPriceCommand command) {
				return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}
		};
	}

	@Bean
	EditVenueProfile editVenueProfile() {
		return (_, _, _, _) -> ProfileUpdateOutcome.NO_SUCH_VENUE;
	}

	/** O8 (#177): the venue admin-profile read the web slices register with {@code VenueAdminController}. */
	@Bean
	ViewVenueProfile viewVenueProfile() {
		return (_, _) -> Optional.empty();
	}

	/**
	 * S9 (#277): the owned-venues read behind {@code GET /api/venues/mine} ({@code MyVenuesController}).
	 * Inert — the shared web slices (CORS + rate-limit + SPA shell) never authenticate an operator, so an
	 * empty list is enough for the context to load. {@code MyVenuesControllerTest} replaces this bean to
	 * drive the real payload.
	 */
	@Bean
	ListOwnedVenues listOwnedVenues() {
		return _ -> List.of();
	}

	/** #142: the photo port {@code VenuePhotoController} registers with — inert not-found defaults. */
	@Bean
	VenuePhotos venuePhotos() {
		return new VenuePhotos() {
			@Override
			public PhotoUploadResult upload(OperatorId operator, VenueId venueId, PhotoSlot slot,
					byte[] image) {
				return new PhotoUploadResult.Rejected(PhotoProcessingResult.Reason.UNREADABLE);
			}

			@Override
			public boolean delete(OperatorId operator, VenueId venueId, PhotoSlot slot) {
				return false;
			}

			@Override
			public Optional<StoredBytes> serve(VenueId venueId, ContentHash hash) {
				return Optional.empty();
			}
		};
	}
}
