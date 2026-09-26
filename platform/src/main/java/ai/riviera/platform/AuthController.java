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
import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorRegistration;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Session login, registration and {@code /me}: edge login machinery; the {@code operator}/{@code customer} modules
 * supply only identity through their {@code api/} ports. Logout is the {@code LogoutFilter} in {@link SecurityConfig}.
 * A controller drives each {@link AuthenticationManager} so a failed login reaches {@link ApiErrorHandler} as an RFC-7807
 * {@code 401}. Two principal types, each with its OWN manager, so a credential in one namespace never authenticates as
 * the other; a login rotates any existing session id before saving the context (fixation). Auth endpoints are
 * non-enumerating and constant-time: RESPONSIBILITIES.md §Platform edge (settled).
 */
@RestController
class AuthController {

	private static final String OPERATOR_PRINCIPAL_TYPE = "OPERATOR";
	private static final String CUSTOMER_PRINCIPAL_TYPE = "CUSTOMER";
	/** The authority a customer principal carries ({@code ROLE_} + type), used to label {@code /me}. */
	private static final String CUSTOMER_ROLE_AUTHORITY = "ROLE_" + CUSTOMER_PRINCIPAL_TYPE;
	/** The authority a platform-admin operator carries, surfaced on {@code /me} so the FE can gate the admin surface. */
	private static final String ADMIN_ROLE_AUTHORITY = "ROLE_ADMIN";

	/**
	 * A {@code {bcrypt}} hash of a fixed non-secret string, computed once (never a literal hash in source); it
	 * authenticates nothing — {@link #register} burns a verify against it on the already-registered branch so a fresh and a
	 * taken email take the same time (D-8).
	 */
	private final String timingEqualizerHash;

	private final AuthenticationManager operatorManager;
	private final AuthenticationManager customerManager;
	private final SecurityContextRepository securityContextRepository;
	private final PasswordEncoder passwordEncoder;
	private final CustomerAccountProvisioning customerAccounts;
	private final OperatorRegistration operatorRegistration;
	private final OperatorAccounts operatorAccounts;
	private final CustomerRecovery recovery;

	AuthController(@Qualifier("authenticationManager") AuthenticationManager operatorManager,
			@Qualifier("customerAuthenticationManager") AuthenticationManager customerManager,
			SecurityContextRepository securityContextRepository,
			PasswordEncoder passwordEncoder,
			CustomerAccountProvisioning customerAccounts,
			OperatorRegistration operatorRegistration,
			OperatorAccounts operatorAccounts,
			CustomerRecovery recovery) {
		this.operatorManager = operatorManager;
		this.customerManager = customerManager;
		this.securityContextRepository = securityContextRepository;
		this.passwordEncoder = passwordEncoder;
		this.customerAccounts = customerAccounts;
		this.operatorRegistration = operatorRegistration;
		this.operatorAccounts = operatorAccounts;
		this.recovery = recovery;
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
	 * Wire DTO for an operator self-registration: the login {@code username}, the
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
	 * The signed-in principal as the FE sees it (login, register and {@code /me}). {@code emailVerified}: the customer's
	 * soft verification state, {@code null} for an operator; register always reports {@code false}, fresh or taken, so the
	 * body stays byte-identical (non-enumeration). {@code admin}: {@code ROLE_ADMIN}, reveals the approval surface; always
	 * {@code false} for a customer. {@code operatorStatus}: {@code PENDING} or {@code ACTIVE} (no other status holds a
	 * session), for the pending-approval notice; {@code null} for a customer.
	 */
	record PrincipalResponse(String username, String principalType, Boolean emailVerified, boolean admin,
			String operatorStatus) {
	}

	@PostMapping("/api/auth/operator/login")
	PrincipalResponse operatorLogin(@RequestBody LoginRequest login, HttpServletRequest request,
			HttpServletResponse response) {
		// A failed authenticate() throws AuthenticationException → ApiErrorHandler → the one generic
		// 401 INVALID_CREDENTIALS (no wrong-password/unknown-user/suspended distinction, D-8).
		Authentication authentication =
				establishSession(operatorManager, login.username(), login.password(), request, response);
		return new PrincipalResponse(authentication.getName(), OPERATOR_PRINCIPAL_TYPE, null,
				adminOf(authentication), operatorStatusOf(authentication));
	}

	/**
	 * Register an operator as {@code PENDING}, never signing it in (the client signs in next). A fresh and a taken
	 * username get the same {@code 202} body and no session (non-enumeration); {@link PasswordPolicy} runs before any write
	 * (its codes: RESPONSIBILITIES.md §Platform edge (settled)).
	 */
	@PostMapping("/api/auth/operator/register")
	ResponseEntity<OperatorRegistrationResponse> operatorRegister(
			@RequestBody OperatorRegistrationRequest registration) {
		// The shared server-side password policy (D-8) — the same rule the customer register enforces.
		String username = registration.username().trim();
		PasswordPolicy.validate(registration.password(), username);
		// Constant-time (D-8): both branches spend exactly ONE bcrypt — the encode() below, evaluated on
		// every request (fresh or taken). Unlike the customer register there is NO auto-sign-in bcrypt on
		// the fresh branch, so NO equalizer is added: a taken-branch verify would make an existing username
		// measurably SLOWER (a reverse enumeration oracle). The write is a bcrypt-free
		// INSERT … ON CONFLICT DO NOTHING either way, so only a fresh username creates the PENDING row; the
		// outcome distinction never surfaces (the response is byte-identical) so it is deliberately unused.
		operatorRegistration.register(username, passwordEncoder.encode(registration.password()),
				registration.contactEmail().trim());
		// No session either branch; the client signs in next, as a PENDING operator may. Byte-identical body.
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(new OperatorRegistrationResponse("PENDING"));
	}

	@PostMapping("/api/auth/customer/login")
	PrincipalResponse customerLogin(@RequestBody CustomerCredentials login, HttpServletRequest request,
			HttpServletResponse response) {
		Authentication authentication =
				establishSession(customerManager, login.email(), login.password(), request, response);
		return new PrincipalResponse(authentication.getName(), CUSTOMER_PRINCIPAL_TYPE,
				verifiedStatus(authentication), false, null);
	}

	/**
	 * Register a customer, auto-signed-in on a fresh email; a taken email gets a byte-identical {@code 201} but no session
	 * (non-enumeration) — the {@code SESSION} cookie's presence is the one accepted residual signal. {@link PasswordPolicy}
	 * runs before any write.
	 */
	@PostMapping("/api/auth/customer/register")
	ResponseEntity<PrincipalResponse> register(@RequestBody CustomerCredentials registration,
			HttpServletRequest request, HttpServletResponse response) {
		// Normalize at the edge so the response echoes the SAME canonical email that /me + login return
		// (stored lower-cased/trimmed) — otherwise the displayed email would change after a reload. The
		// module normalizes again internally (idempotent); the edge only encodes the password, never
		// touching a Spring Security type inside the module (RV-BE-11).
		String email = Emails.normalize(registration.email());
		PasswordPolicy.validate(registration.password(), PasswordPolicy.emailLocalPart(email));
		RegistrationOutcome outcome =
				customerAccounts.register(email, passwordEncoder.encode(registration.password()));
		if (outcome instanceof RegistrationOutcome.Registered(
                CustomerAccountId accountId
        )) {
			establishSession(customerManager, email, registration.password(), request, response);
			// A fresh account gets a verification email (soft/non-blocking). Only on the
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
				.body(new PrincipalResponse(email, CUSTOMER_PRINCIPAL_TYPE, false, false, null));
	}

	/**
	 * The FE's reload-restore read for both principal types ({@code principalType} derived from the authorities).
	 * Anonymous requests never get here: the entry point answers {@code 401 UNAUTHENTICATED}, which the FE treats as
	 * signed-out state, not an error.
	 */
	@GetMapping("/api/auth/me")
	PrincipalResponse me(Authentication authentication) {
		return new PrincipalResponse(authentication.getName(), principalTypeOf(authentication),
				verifiedStatus(authentication), adminOf(authentication), operatorStatusOf(authentication));
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

	/** Whether the authenticated principal is a platform admin ({@code ROLE_ADMIN}). */
	private static boolean adminOf(Authentication authentication) {
		return authentication.getAuthorities().stream()
				.anyMatch(authority -> ADMIN_ROLE_AUTHORITY.equals(authority.getAuthority()));
	}

	/**
	 * The signed-in principal's soft email-verified state, or {@code null} for a non-customer.
	 * The role check is in-memory and the customer branch is a single by-email read — the principal
	 * name IS the account email, so the old resolve-id-then-read-flag pair was a second round trip for free.
	 */
	private Boolean verifiedStatus(Authentication authentication) {
		if (!CUSTOMER_PRINCIPAL_TYPE.equals(principalTypeOf(authentication))) {
			return null;
		}
		return recovery.verifiedFor(authentication.getName()).orElse(null);
	}

	/**
	 * The signed-in operator's lifecycle status token, or {@code null} for a customer principal.
	 * A single by-username read; the account always exists for a live operator session.
	 */
	private String operatorStatusOf(Authentication authentication) {
		if (!OPERATOR_PRINCIPAL_TYPE.equals(principalTypeOf(authentication))) {
			return null;
		}
		return operatorAccounts.findByUsername(authentication.getName())
				.map(credential -> credential.status().name())
				.orElse(null);
	}
}
