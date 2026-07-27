package ai.riviera.platform;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.operator.api.OperatorRegistration;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Session login + registration + current-principal endpoints (issues #109, #111; design D-1/D-2/D-8).
 * A principal signs in ONCE here and rides the resulting {@code SESSION} cookie; logout is the framework
 * {@code LogoutFilter} configured in {@link SecurityConfig} (not a handler here). Platform-edge login
 * machinery — the {@code operator}/{@code customer} modules only supply credentials/identity via their
 * {@code api/} ports (RV-BE-11, pinned by {@code OperatorAuthPlacementTests} / {@code CustomerAuthPlacementTests}).
 *
 * <p><strong>Controller-based on purpose</strong> (grill-gate re-decision on #109): driving the
 * framework {@link AuthenticationManager} from a controller keeps D-1's "no custom token filters"
 * intact <em>and</em> routes a failed login through the single {@link ApiErrorHandler} advice —
 * so the 401 lands on the RFC-7807 contract (#97) instead of a filter's bare status.
 *
 * <p><strong>Two principal types, two managers</strong> (D-2). The paths are principal-typed
 * ({@code /api/auth/operator/login}, {@code /api/auth/customer/login|register}); each login drives its
 * OWN {@link AuthenticationManager} (operator: S1's auto-configured bean; customer: the explicit
 * {@code customerAuthenticationManager}) so a credential in one namespace can never authenticate as the
 * other (AC-5). {@code /me} and {@code /logout} are principal-agnostic — {@code /me} derives the
 * {@code principalType} from the authenticated authorities.
 *
 * <p>Session fixation (D-1): a login arriving with a live session rotates its id before the
 * authenticated context is saved, so a pre-login id an attacker may have planted never becomes an
 * authenticated session. Pinned by {@code AuthSessionIT.sessionIdRotatesOnLogin}.
 */
@RestController
class AuthController {

	private static final String OPERATOR_PRINCIPAL_TYPE = "OPERATOR";
	private static final String CUSTOMER_PRINCIPAL_TYPE = "CUSTOMER";
	/** The authority a customer principal carries ({@code ROLE_} + type), used to label {@code /me}. */
	private static final String CUSTOMER_ROLE_AUTHORITY = "ROLE_" + CUSTOMER_PRINCIPAL_TYPE;
	/** The authority a platform-admin operator carries (#115), surfaced on {@code /me} so the FE can gate the admin surface. */
	private static final String ADMIN_ROLE_AUTHORITY = "ROLE_ADMIN";

	/**
	 * A throwaway {@code {bcrypt}} hash computed ONCE at construction from a fixed non-secret string
	 * (never a literal in source — so it is not an exposed credential), used solely to burn an
	 * equivalent bcrypt verify on the already-registered branch of {@link #register} so a fresh vs. a
	 * taken email take the same time (closes the timing-enumeration oracle, D-8). It authenticates
	 * nothing; its cost matches the delegating encoder's default because the encoder produced it.
	 */
	private final String timingEqualizerHash;

	private final AuthenticationManager operatorManager;
	private final AuthenticationManager customerManager;
	private final SecurityContextRepository securityContextRepository;
	private final PasswordEncoder passwordEncoder;
	private final CustomerAccountProvisioning customerAccounts;
	private final OperatorRegistration operatorRegistration;
	private final CustomerRecovery recovery;
	private final CurrentCustomer currentCustomer;

	AuthController(@Qualifier("authenticationManager") AuthenticationManager operatorManager,
			@Qualifier("customerAuthenticationManager") AuthenticationManager customerManager,
			SecurityContextRepository securityContextRepository,
			PasswordEncoder passwordEncoder,
			CustomerAccountProvisioning customerAccounts,
			OperatorRegistration operatorRegistration,
			CustomerRecovery recovery,
			CurrentCustomer currentCustomer) {
		this.operatorManager = operatorManager;
		this.customerManager = customerManager;
		this.securityContextRepository = securityContextRepository;
		this.passwordEncoder = passwordEncoder;
		this.customerAccounts = customerAccounts;
		this.operatorRegistration = operatorRegistration;
		this.recovery = recovery;
		this.currentCustomer = currentCustomer;
		this.timingEqualizerHash = passwordEncoder.encode("timing-equalizer-not-a-credential");
	}

	/**
	 * Wire DTO for an operator JSON login. Presence checks live in the compact constructor (§6b
	 * centralized-explicit style): a malformed body fails deserialization → the one advice →
	 * {@code 400 INVALID_REQUEST}, never a stack trace.
	 */
	record LoginRequest(String username, String password) {
		LoginRequest {
			if (username == null || username.isBlank() || password == null || password.isEmpty()) {
				throw new IllegalArgumentException("username and password are required");
			}
		}
	}

	/**
	 * Wire DTO for an operator self-registration (#115, S6): the login {@code username}, the
	 * {@code password}, and a {@code contactEmail} for the admin's approval decision. Presence checks in
	 * the compact constructor (§6b centralized-explicit style) → a malformed body is {@code 400 INVALID_REQUEST}.
	 */
	record OperatorRegistrationRequest(String username, String password, String contactEmail) {
		OperatorRegistrationRequest {
			if (username == null || username.isBlank() || password == null || password.isEmpty()
					|| contactEmail == null || contactEmail.isBlank()) {
				throw new IllegalArgumentException("username, password and contactEmail are required");
			}
		}
	}

	/**
	 * The neutral acknowledgement of an operator self-registration — {@code status} is always
	 * {@code "PENDING"}, byte-identical for a fresh vs. an already-taken username (non-enumeration, D-8).
	 */
	record OperatorRegistrationResponse(String status) {
	}

	/** Wire DTO for a customer login/register (email + password). Same presence discipline. */
	record CustomerCredentials(String email, String password) {
		CustomerCredentials {
			if (email == null || email.isBlank() || password == null || password.isEmpty()) {
				throw new IllegalArgumentException("email and password are required");
			}
		}
	}

	/**
	 * The signed-in principal as the FE sees it (login/register responses and {@code /me} share it).
	 * {@code emailVerified} is the customer's soft email-verification state (S8 #113) for the "please
	 * verify" nudge; {@code null} for an operator principal (not a customer concept). A fresh registration
	 * is always {@code false}, and the neutral already-registered branch also reports {@code false} so the
	 * response stays byte-identical (non-enumeration, D-8). {@code admin} (S6 #115) is {@code true} for a
	 * platform-admin operator ({@code ROLE_ADMIN}), so the FE can reveal the approval surface; always
	 * {@code false} for a customer.
	 */
	record PrincipalResponse(String username, String principalType, Boolean emailVerified, boolean admin) {
	}

	@PostMapping("/api/auth/operator/login")
	PrincipalResponse operatorLogin(@RequestBody LoginRequest login, HttpServletRequest request,
			HttpServletResponse response) {
		// A failed authenticate() throws AuthenticationException → ApiErrorHandler → the one generic
		// 401 INVALID_CREDENTIALS (no wrong-password/unknown-user/suspended distinction, D-8).
		Authentication authentication =
				establishSession(operatorManager, login.username(), login.password(), request, response);
		return new PrincipalResponse(authentication.getName(), OPERATOR_PRINCIPAL_TYPE, null,
				adminOf(authentication));
	}

	/**
	 * Register an operator account (S6, #115). Unlike the customer register, a fresh registration does
	 * <strong>NOT</strong> sign the operator in: the account is created {@code PENDING} and cannot
	 * authenticate until a platform admin approves it (design D-5). Both a fresh username and an
	 * already-taken one return the SAME {@code 202} body and NEVER a session (non-enumeration, D-8); only
	 * the fresh branch writes the PENDING row. Password policy is enforced BEFORE any write; a violation
	 * is {@code 400 INVALID_REQUEST}.
	 */
	@PostMapping("/api/auth/operator/register")
	ResponseEntity<OperatorRegistrationResponse> operatorRegister(
			@RequestBody OperatorRegistrationRequest registration) {
		// The shared server-side password policy (D-8 min length / bcrypt-input cap) — the same rule the
		// customer register enforces; both principal types get one policy.
		CustomerPasswords.validate(registration.password());
		// Constant-time (D-8): both branches spend exactly ONE bcrypt — the encode() below, evaluated on
		// every request (fresh or taken). Unlike the customer register there is NO auto-sign-in bcrypt on
		// the fresh branch, so NO equalizer is added: a taken-branch verify would make an existing username
		// measurably SLOWER (a reverse enumeration oracle). The write is a bcrypt-free
		// INSERT … ON CONFLICT DO NOTHING either way, so only a fresh username creates the PENDING row; the
		// outcome distinction never surfaces (the response is byte-identical) so it is deliberately unused.
		operatorRegistration.register(registration.username().trim(),
				passwordEncoder.encode(registration.password()), registration.contactEmail().trim());
		// No session either branch — a PENDING operator cannot sign in until approved. Byte-identical body.
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(new OperatorRegistrationResponse("PENDING"));
	}

	@PostMapping("/api/auth/customer/login")
	PrincipalResponse customerLogin(@RequestBody CustomerCredentials login, HttpServletRequest request,
			HttpServletResponse response) {
		Authentication authentication =
				establishSession(customerManager, login.email(), login.password(), request, response);
		return new PrincipalResponse(authentication.getName(), CUSTOMER_PRINCIPAL_TYPE,
				verifiedStatus(authentication), false);
	}

	/**
	 * Register a customer account (S2, #111). Fresh email → the account is created and the caller is
	 * auto-signed-in (a session is established, AC-3). An already-registered email → the response is
	 * <strong>byte-identical</strong> but NO session is established (non-enumeration, design D-8; the
	 * only residual signal is the presence of the {@code SESSION} cookie — an accepted trade-off).
	 * Password policy is enforced BEFORE any write; a violation is {@code 400 INVALID_REQUEST}.
	 */
	@PostMapping("/api/auth/customer/register")
	ResponseEntity<PrincipalResponse> register(@RequestBody CustomerCredentials registration,
			HttpServletRequest request, HttpServletResponse response) {
		CustomerPasswords.validate(registration.password());
		// Normalize at the edge so the response echoes the SAME canonical email that /me + login return
		// (stored lower-cased/trimmed) — otherwise the displayed email would change after a reload. The
		// module normalizes again internally (idempotent); the edge only encodes the password, never
		// touching a Spring Security type inside the module (RV-BE-11).
		String email = CustomerPasswords.normalizeEmail(registration.email());
		RegistrationOutcome outcome =
				customerAccounts.register(email, passwordEncoder.encode(registration.password()));
		if (outcome instanceof RegistrationOutcome.Registered(
                CustomerAccountId accountId
        )) {
			establishSession(customerManager, email, registration.password(), request, response);
			// S8 (#113): a fresh account gets a verification email (soft/non-blocking). Only on the
			// Registered branch — the neutral already-registered branch sends nothing, so no enumeration leak.
			recovery.sendVerificationEmail(accountId, email);
		}
		else {
			// Constant-time (D-8): the fresh branch spends a bcrypt verify inside establishSession's
			// authenticate(); burn an equivalent verify here so an already-registered email is not
			// measurably faster — a latency gap would be an account-enumeration oracle.
			passwordEncoder.matches(registration.password(), timingEqualizerHash);
		}
		// Fresh and duplicate return the identical status + body; only the fresh branch set a cookie + mailed.
		// emailVerified is always false here — a fresh account is unverified and the neutral branch matches it.
		// admin is always false because a customer is never a platform admin.
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(new PrincipalResponse(email, CUSTOMER_PRINCIPAL_TYPE, false, false));
	}

	/**
	 * The FE's reload-restore read: who does this session belong to? Anonymous requests never get
	 * here — the entry point answers {@code 401 UNAUTHENTICATED} (the signed-out signal the FE
	 * treats as state, not error). The {@code principalType} is derived from the authorities so the
	 * one endpoint serves both principal types.
	 */
	@GetMapping("/api/auth/me")
	PrincipalResponse me(Authentication authentication) {
		return new PrincipalResponse(authentication.getName(), principalTypeOf(authentication),
				verifiedStatus(authentication), adminOf(authentication));
	}

	/**
	 * Authenticate against {@code manager}, rotate the session id if one already exists (fixation, D-1),
	 * and persist the authenticated context so subsequent requests ride the {@code SESSION} cookie.
	 * Shared by the operator + customer logins and the register auto-sign-in.
	 */
	private Authentication establishSession(AuthenticationManager manager, String username, String password,
			HttpServletRequest request, HttpServletResponse response) {
		Authentication authentication = manager.authenticate(
				UsernamePasswordAuthenticationToken.unauthenticated(username, password));
		SessionAuthentication.establish(securityContextRepository, authentication, request, response);
		return authentication;
	}

	private static String principalTypeOf(Authentication authentication) {
		boolean customer = authentication.getAuthorities().stream()
				.anyMatch(authority -> CUSTOMER_ROLE_AUTHORITY.equals(authority.getAuthority()));
		return customer ? CUSTOMER_PRINCIPAL_TYPE : OPERATOR_PRINCIPAL_TYPE;
	}

	/** Whether the authenticated principal is a platform admin ({@code ROLE_ADMIN}, #115). */
	private static boolean adminOf(Authentication authentication) {
		return authentication.getAuthorities().stream()
				.anyMatch(authority -> ADMIN_ROLE_AUTHORITY.equals(authority.getAuthority()));
	}

	/** The signed-in principal's soft email-verified state, or {@code null} for a non-customer (S8 #113). */
	private Boolean verifiedStatus(Authentication authentication) {
		return currentCustomer.optional(authentication).map(recovery::isVerified).orElse(null);
	}
}
