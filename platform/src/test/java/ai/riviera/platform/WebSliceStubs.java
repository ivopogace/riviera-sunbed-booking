package ai.riviera.platform;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import ai.riviera.platform.availability.application.MarkOutcome;
import ai.riviera.platform.availability.application.ReleaseOutcome;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.refund.RefundForWeather;
import ai.riviera.platform.booking.application.refund.RefundOutboxStatus;
import ai.riviera.platform.booking.application.refund.RefundResubmission;
import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.ExpireRequests;
import ai.riviera.platform.booking.application.request.PendingRequests;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.checkin.CheckInBooking;
import ai.riviera.platform.booking.application.checkin.CheckInResult;
import ai.riviera.platform.booking.application.view.ListDailyBookings;
import ai.riviera.platform.booking.application.view.MyBookings;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.booking.vocabulary.BookingId;
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
import ai.riviera.platform.notification.application.BookingConfirmationResend;
import ai.riviera.platform.notification.application.MailDeliveryLookup;
import ai.riviera.platform.notification.application.MailOutboxStatus;
import ai.riviera.platform.notification.application.MailResubmission;
import ai.riviera.platform.notification.application.ReinstateOutcome;
import ai.riviera.platform.notification.application.ReinstateSuppression;
import ai.riviera.platform.notification.application.ResendOutcome;
import ai.riviera.platform.notification.api.MailDeliverability;
import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.api.OperatorRegistration;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;
import ai.riviera.platform.operator.vocabulary.PendingOperator;
import ai.riviera.platform.payment.adapter.out.StripeProperties;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.RefundState;
import ai.riviera.platform.payment.application.StripeWebhookEvents;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.DailyTakingsView;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.application.VenueLedger;
import ai.riviera.platform.payout.application.ViewDailyTakings;
import ai.riviera.platform.payout.application.ViewPayoutLedger;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.shared.CurrentCustomer;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.ResubmissionOutcome;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.application.AddSetOutcome;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.CommissionRateCommand;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.EditVenueProfile;
import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.ListOwnedVenues;
import ai.riviera.platform.venue.application.ListVenueReviews;
import ai.riviera.platform.venue.application.OnboardVenue;
import ai.riviera.platform.venue.application.VenueCreationProperties;
import ai.riviera.platform.venue.application.PhotoProcessingResult;
import ai.riviera.platform.venue.application.PhotoSlotView;
import ai.riviera.platform.venue.application.PhotoUploadResult;
import ai.riviera.platform.venue.application.ProfileUpdateOutcome;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.ReplaceRejection;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.application.StoredBytes;
import ai.riviera.platform.venue.application.VenueCommissionAdministration;
import ai.riviera.platform.venue.application.VenueCommissionView;
import ai.riviera.platform.venue.application.VenuePhotoModeration;
import ai.riviera.platform.venue.application.VenuePhotos;
import ai.riviera.platform.venue.application.ViewDailyAvailability;
import ai.riviera.platform.venue.application.ViewVenueProfile;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.application.ModerationPage;
import ai.riviera.platform.review.application.ReviewLifecycle;
import ai.riviera.platform.review.application.ReviewModeration;
import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.ModerationOutcome;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

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

	/**
	 * The slice carries no metrics auto-configuration, so a controller that counts something — the
	 * Stripe webhook's failed-refund counter — needs a registry to count into.
	 */
	@Bean
	MeterRegistry meterRegistry() {
		return new SimpleMeterRegistry();
	}

	/** Request-to-Book web-slice stubs: the controller/scheduler ports with inert defaults. */
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
	ai.riviera.platform.booking.application.request.WithdrawRequest withdrawRequest() {
		return _ -> ai.riviera.platform.booking.application.request.WithdrawOutcome.Rejected.NO_SUCH_BOOKING;
	}

	@Bean
	ai.riviera.platform.booking.application.cancel.QuoteCancellationTerms quoteCancellationTerms() {
		return (_, _) -> Optional.empty();
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
	 * Credential store for the edge {@code UserDetailsService} imported via {@code SecurityConfig}.
	 * The web slices only hit permit-all endpoints / preflights, never an authenticated login,
	 * so an empty store is enough — no operator can be authenticated here.
	 */
	@Bean
	OperatorAccounts operatorAccounts() {
		return _ -> Optional.empty();
	}

	/**
	 * Customer account ports that {@code SecurityConfig}'s {@code customerAuthenticationManager}
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
	 * The proof-of-work registry the web slices verify against: the same claim-once contract as the
	 * Postgres adapter, held in a map, so {@code ChallengeVerificationFilterTest} can prove a replay
	 * loses without a database.
	 */
	@Bean
	ChallengeRegistry challengeRegistry() {
		return new InMemoryChallengeRegistry();
	}

	static final class InMemoryChallengeRegistry implements ChallengeRegistry {

		private final java.util.concurrent.ConcurrentMap<String, Instant> claimed =
				new java.util.concurrent.ConcurrentHashMap<>();

		@Override
		public boolean claim(String challengeId, Instant expiresAt) {
			return claimed.putIfAbsent(challengeId, expiresAt) == null;
		}

		@Override
		public int deleteExpiredBefore(Instant cutoff) {
			int before = claimed.size();
			claimed.values().removeIf(expiresAt -> expiresAt.isBefore(cutoff));
			return before - claimed.size();
		}
	}

	/**
	 * [D5] right-to-erasure port that {@code MyErasureController} + {@code AdminErasureController}
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

	/**
	 * The credential-write port {@code OperatorAccountController} registers with. Inert — the shared
	 * web slices never change a real password, and {@code setPassword} returning {@code false} is the
	 * "no such operator" answer. {@code OperatorAccountControllerTest} replaces this bean to drive the flow.
	 */
	@Bean
	OperatorProvisioning operatorProvisioning() {
		return new OperatorProvisioning() {
			@Override
			public OperatorId provision(String username, String passwordHash) {
				return new OperatorId(0);
			}

			@Override
			public boolean setPassword(String username, String passwordHash) {
				return false;
			}
		};
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
			public Optional<String> usernameInStatus(OperatorId operatorId,
					ai.riviera.platform.operator.vocabulary.OperatorStatus expected) {
				return Optional.empty();
			}

			@Override
			public ApprovalOutcome approve(OperatorId operatorId) {
				return new ApprovalOutcome.NoSuchOperator();
			}

			@Override
			public ApprovalOutcome reject(OperatorId operatorId) {
				return new ApprovalOutcome.NoSuchOperator();
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
	 * The customer account-id resolver + the edge helper that {@code BookingController}
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
	 * The edge SSO ports {@code SsoController} requires. Inert — the web slices (CORS +
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
	 * The edge account-recovery collaborators the recovery/set-password controllers +
	 * {@code AuthController} depend on. All inert — the web slices (CORS + rate-limit) never redeem a token,
	 * send mail, or revoke a session, so an always-invalid recovery port, a no-op send port, and an
	 * empty-session repository are enough for the context to load and for a rate-limit attempt to reach the
	 * limiter. {@code RecoveryProperties} + {@code Clock} come from {@code SecurityConfig}'s
	 * {@code @EnableConfigurationProperties} and the fixed {@link #clock()} bean above.
	 */
	@Bean
	MailSender mailSender() {
		return new MailSender() {
			@Override
			public void sendEmailVerification(String toEmail, URI verificationLink) {
			}

			@Override
			public void sendPasswordReset(String toEmail, URI resetLink) {
			}

			@Override
			public void sendOperatorApproved(String toEmail, URI signInLink) {
			}
		};
	}

	/**
	 * The edge collaborator behind the approval mail. Deliberately the <strong>real</strong> one
	 * over the inert {@link MailSender} above, not a stub: {@code AdminOperatorController} now depends on
	 * it, and a stub here would make every web slice green against a class that never ran. A test wanting
	 * the send to fail overrides the {@code MailSender} bean instead.
	 */
	@Bean
	OperatorApprovalMail operatorApprovalMail(MailSender mailSender, RecoveryProperties recoveryProperties) {
		return new OperatorApprovalMail(mailSender, recoveryProperties);
	}

	/**
	 * {@code AdminEmailSuppressionController}'s port. Inert: the web slices never lift a real
	 * suppression, and "nothing was on the list" is the outcome that writes nothing.
	 */
	@Bean
	ReinstateSuppression reinstateSuppression() {
		return _ -> new ReinstateOutcome.NotSuppressed();
	}

	/**
	 * {@code AdminMailDeliveryController}'s two ports. Inert: no bookings for any address, and a
	 * resend that reports an unknown booking — so a slice that merely loads the controller mails nobody.
	 * {@code AdminMailDeliveryControllerTest} overrides both with {@code @MockitoBean}s to drive the real
	 * shapes.
	 */
	@Bean
	MailDeliveryLookup mailDeliveryLookup() {
		return _ -> List.of();
	}

	@Bean
	BookingConfirmationResend bookingConfirmationResend() {
		return _ -> ResendOutcome.NO_SUCH_BOOKING;
	}

	/**
	 * {@code AdminMailOutboxController}'s port. Inert: an empty outbox with the lever accepting,
	 * so a slice that merely loads the controller re-drives nothing. {@code AdminMailOutboxControllerTest}
	 * overrides it with a {@code @MockitoBean} to drive the real outcomes.
	 */
	@Bean
	MailResubmission mailResubmission() {
		return new MailResubmission() {
			@Override
			public MailOutboxStatus status() {
				return new MailOutboxStatus(0, Duration.ZERO);
			}

			@Override
			public ResubmissionOutcome resubmit() {
				return new ResubmissionOutcome.Resubmitted(0, Duration.ZERO);
			}
		};
	}

	/**
	 * {@code AdminRefundOutboxController}'s port. Inert: an empty outbox with the lever
	 * accepting, so a slice that merely loads the controller re-drives nothing.
	 * {@code AdminRefundOutboxControllerTest} overrides it with a {@code @MockitoBean}.
	 */
	@Bean
	RefundResubmission refundResubmission() {
		return new RefundResubmission() {
			@Override
			public RefundOutboxStatus status() {
				return new RefundOutboxStatus(0, Duration.ZERO);
			}

			@Override
			public ResubmissionOutcome resubmit() {
				return new ResubmissionOutcome.Resubmitted(0, Duration.ZERO);
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
			public Optional<String> emailForResetToken(String tokenHash) {
				return Optional.empty();
			}

			@Override
			public void setPassword(CustomerAccountId accountId, String newPasswordHash) {
			}

			@Override
			public Optional<Boolean> emailVerifiedFor(String email) {
				// Empty = no account, mirroring the earlier stub world (/me answered emailVerified: null).
				return Optional.empty();
			}
		};
	}

	@Bean
	RecoveryTokens recoveryTokens() {
		return new RecoveryTokens();
	}

	@Bean
	CustomerRecovery customerRecovery(CustomerAccountRecovery recovery, MailSender mailSender,
			MailDeliverability mailDeliverability, RecoveryTokens recoveryTokens,
			RecoveryProperties recoveryProperties, Clock clock) {
		return new CustomerRecovery(recovery, mailSender, mailDeliverability, recoveryTokens, recoveryProperties,
				clock);
	}

	/** Nothing is suppressed in a web slice — the withheld branch is pinned where it is real. */
	@Bean
	MailDeliverability mailDeliverability() {
		return toEmail -> false;
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
	CheckInBooking checkInBooking() {
		return (_, _, _) -> new CheckInResult.NotFound();
	}

	@Bean
	RefundForWeather refundForWeather() {
		return (_, _, _) -> new WeatherRefundOutcome(0, 0, "EUR");
	}

	@Bean
	ViewPayoutLedger viewPayoutLedger() {
		return (_, venueId) -> new VenueLedger(venueId, "EUR", 0, List.of());
	}

	/** The console takings read: an inert zero figure — the web slices don't exercise the amount. */
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

			@Override
			public Optional<List<ai.riviera.platform.venue.vocabulary.DailyAvailability>> availabilityBetween(
					VenueId id, LocalDate from, LocalDate to) {
				return Optional.empty();
			}
		};
	}

	@Bean
	SetBookingFacts setBookingFacts() {
		return new SetBookingFacts() {
			@Override
			public Optional<String> poolForClaim(SetId setId) {
				return Optional.empty();
			}

			@Override
			public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
				return Optional.empty();
			}

			@Override
			public Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId> setIds) {
				return Map.of();
			}
		};
	}

	@Bean
	VenueCommissionAdministration venueCommissionAdministration() {
		return new VenueCommissionAdministration() {
			@Override
			public List<VenueCommissionView> venueCommissions() {
				return List.of();
			}

			@Override
			public Optional<VenueCommissionView> setCommission(VenueId venueId,
					CommissionRateCommand command) {
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
			public OptionalInt commissionBpsOn(VenueId id, LocalDate serviceDate) {
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
			public boolean markStatus(String paymentIntentId, PaymentStatus status) {
				return false;
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
			public void markRefundAttempted(BookingRef booking) {
			}

			@Override
			public boolean markRefunded(BookingRef booking, long refundedMinor, String refundId) {
				return true;
			}

			@Override
			public Optional<RefundState> findRefundState(BookingRef booking) {
				return Optional.empty();
			}

			@Override
			public boolean markRefundFailed(String refundId) {
				return false;
			}

			@Override
			public boolean markUnrecordedRefundFailed(String paymentIntentId, String refundId) {
				return false;
			}

			@Override
			public long owedRefundCount() {
				return 0L;
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
	VenueCreationProperties venueCreationProperties() {
		return new VenueCreationProperties(500);
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

			@Override
			public ChangeOutcome renameRow(OperatorId operator, VenueId venueId, long expectedVersion,
					ai.riviera.platform.venue.application.RowNameCommand command) {
				return new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE);
			}
		};
	}

	@Bean
	EditVenueProfile editVenueProfile() {
		return (_, _, _, _) -> ProfileUpdateOutcome.NO_SUCH_VENUE;
	}

	/** The venue admin-profile read the web slices register with {@code VenueAdminController}. */
	@Bean
	ViewVenueProfile viewVenueProfile() {
		return (_, _) -> Optional.empty();
	}

	/** The public review list behind {@code GET /api/venues/{id}/reviews} — inert: no venue is visible. */
	@Bean
	ListVenueReviews listVenueReviews() {
		return (_, _) -> Optional.empty();
	}

	/** The owner daily availability-states read behind {@code GET /api/venues/{id}/availability}. */
	@Bean
	ViewDailyAvailability viewDailyAvailability() {
		return (_, _, _) -> Optional.empty();
	}

	/**
	 * The owned-venues read behind {@code GET /api/venues/mine} ({@code MyVenuesController}).
	 * Inert — the shared web slices (CORS + rate-limit + SPA shell) never authenticate an operator, so an
	 * empty list is enough for the context to load. {@code MyVenuesControllerTest} replaces this bean to
	 * drive the real payload.
	 */
	@Bean
	ListOwnedVenues listOwnedVenues() {
		return _ -> List.of();
	}

	/** The photo port {@code VenuePhotoController} registers with — inert not-found defaults. */
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
			public boolean exists(VenueId venueId, ContentHash hash) {
				return false;
			}

			@Override
			public Optional<StoredBytes> serve(VenueId venueId, ContentHash hash) {
				return Optional.empty();
			}
		};
	}

	/**
	 * The audit trail {@code SecurityConfig}'s {@code AdminAuditFilter} + {@code AdminAuditController}
	 * register with — inert, so the web slices exercise routing and the role gate, never the table.
	 */
	@Bean
	AdminAuditLog adminAuditLog() {
		return new AdminAuditLog() {
			@Override
			public void append(String actor, String method, String path, int status, String reason) {
			}

			@Override
			public List<Entry> latest(int limit) {
				return List.of();
			}
		};
	}

	/**
	 * The moderation port {@code AdminVenuePhotoController} registers with — inert, so the
	 * web slice exercises routing and the role gate, never storage. No longer a lambda: the port grew
	 * a second method when the read joined the takedown.
	 */
	@Bean
	VenuePhotoModeration venuePhotoModeration() {
		return new VenuePhotoModeration() {

			@Override
			public List<PhotoSlotView> slotsOf(VenueId venueId) {
				return List.of();
			}

			@Override
			public boolean takedown(VenueId venueId, PhotoSlot slot) {
				return false;
			}
		};
	}

	/**
	 * The review lifecycle port {@code ReviewController} registers with — inert, so the web slice
	 * exercises routing, CSRF and the permitAll matcher. {@code ReviewControllerTest} overrides it
	 * with a {@code @MockitoBean} to drive the real outcomes.
	 */
	@Bean
	ReviewLifecycle reviewLifecycle() {
		return new ReviewLifecycle() {

			@Override
			public SubmitOutcome submit(String bookingCode, ReviewSubmission submission) {
				return new SubmitOutcome.NoSuchStay();
			}

			@Override
			public AmendOutcome edit(String bookingCode, ReviewSubmission submission) {
				return new AmendOutcome.NoSuchStay();
			}

			@Override
			public AmendOutcome delete(String bookingCode) {
				return new AmendOutcome.NoSuchStay();
			}
		};
	}

	/** The eligibility port the code-gated booking read consults for its review panel. */
	@Bean
	ReviewEligibility reviewEligibility() {
		return _ -> new ReviewPanel.NoSuchStay();
	}

	/**
	 * The moderation port {@code AdminReviewController} registers with — inert, so the web slice
	 * exercises routing and the {@code ADMIN} gate, never storage.
	 */
	@Bean
	ReviewModeration reviewModeration() {
		return new ReviewModeration() {

			@Override
			public ModerationPage pageFor(VenueRef venue, ReviewCursor from) {
				return new ModerationPage(List.of(), false);
			}

			@Override
			public ModerationOutcome hide(ReviewRef review) {
				return new ModerationOutcome.NoSuchReview();
			}

			@Override
			public ModerationOutcome unhide(ReviewRef review) {
				return new ModerationOutcome.NoSuchReview();
			}
		};
	}
}
