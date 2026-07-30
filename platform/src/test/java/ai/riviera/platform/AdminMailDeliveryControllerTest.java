package ai.riviera.platform;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.BookingConfirmationResend;
import ai.riviera.platform.notification.application.MailAttempt;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;
import ai.riviera.platform.notification.application.MailDeliveryBooking;
import ai.riviera.platform.notification.application.MailDeliveryLookup;
import ai.riviera.platform.notification.application.ResendOutcome;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the ADMIN mail-delivery surface ({@code /api/admin/mail-deliveries}, #380) through
 * the real filter chain — the {@code AdminMailOutboxControllerTest} pattern:
 *
 * <ol>
 * <li><strong>ADMIN role gate</strong>: an ADMIN succeeds; an OPERATOR / CUSTOMER is {@code 403}; an
 * anonymous request {@code 401} — and none of them reaches the ports, which matters on the resend
 * because reaching it would mail a tourist.</li>
 * <li><strong>Every resend outcome is {@code 200}</strong> with its own token, including both
 * refusals: an admin needs to know <em>which</em> one to know what to do next.</li>
 * <li><strong>A shapeless address is the one {@code 400}</strong>, as RFC-7807 rather than a bespoke
 * error body — otherwise a typo would come back as an empty list reading "nothing to do here".</li>
 * <li><strong>Nothing leaks</strong> (invariant #7): the lookup response carries ids, a venue name, a
 * date and outcome tokens — no arrival code, no recipient address.</li>
 * </ol>
 *
 * <p>Lives in the root test package, unlike the controller it covers, because {@code WebSliceStubs} is
 * package-private here and the subject is the admin surface <em>through</em> {@code SecurityConfig}. The
 * behaviour behind the ports has its own tests ({@code BookingConfirmationResendServiceTest},
 * {@code MailDeliveryLookupServiceTest}); the end-to-end path is {@code AdminMailDeliveryIT}.
 * Docker-free {@code @WebMvcTest} slice.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminMailDeliveryControllerTest {

	private static final String LOOKUP = "/api/admin/mail-deliveries/lookup";
	private static final String RESEND = "/api/admin/mail-deliveries/42/resend";
	private static final String EMAIL = "tourist@example.com";
	private static final String LOOKUP_BODY = "{\"email\":\"" + EMAIL + "\"}";
	private static final String ARRIVAL_CODE = "ABCD2345";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	MailDeliveryLookup lookup;

	@MockitoBean
	BookingConfirmationResend resend;

	@Test
	void adminSeesEachBookingWithItsAttemptHistory() throws Exception {
		when(lookup.forEmail(EMAIL)).thenReturn(List.of(new MailDeliveryBooking(new BookingId(42L),
				"Vala Beach", LocalDate.of(2026, 8, 1), true,
				List.of(new MailAttempt(new BookingId(42L), MailAttemptSource.ADMIN_RESEND,
								MailAttemptOutcome.SENT, Instant.parse("2026-07-30T09:31:00Z")),
						new MailAttempt(new BookingId(42L), MailAttemptSource.AUTOMATIC,
								MailAttemptOutcome.WITHHELD_SUPPRESSED,
								Instant.parse("2026-07-29T14:02:11Z"))))));

		mvc.perform(post(LOOKUP).with(user("operator").roles("ADMIN")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(LOOKUP_BODY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.bookings[0].bookingId").value(42))
				.andExpect(jsonPath("$.bookings[0].venueName").value("Vala Beach"))
				.andExpect(jsonPath("$.bookings[0].bookingDate").value("2026-08-01"))
				.andExpect(jsonPath("$.bookings[0].everConfirmed").value(true))
				.andExpect(jsonPath("$.bookings[0].attempts[0].source").value("ADMIN_RESEND"))
				.andExpect(jsonPath("$.bookings[0].attempts[0].outcome").value("SENT"))
				.andExpect(jsonPath("$.bookings[0].attempts[1].outcome").value("WITHHELD_SUPPRESSED"));
	}

	@Test
	void anAddressWithNothingToShowIsAnEmptyListNotA404() throws Exception {
		when(lookup.forEmail(EMAIL)).thenReturn(List.of());

		mvc.perform(post(LOOKUP).with(user("operator").roles("ADMIN")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(LOOKUP_BODY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.bookings").isEmpty());
	}

	/**
	 * A shapeless value can never match anything, so answering "no bookings" would hide the admin's typo
	 * behind a {@code 200} (the #398 lesson, now shared through {@code AddressShape}).
	 */
	@ParameterizedTest(name = "[{index}] {0}")
	@ValueSource(strings = {
			"{\"email\":\"\"}", "{\"email\":\"   \"}", "{\"email\":\"not-an-address\"}",
			"{\"email\":\"user@\"}", "{\"email\":\"@example.com\"}", "{}"})
	void aShapelessAddressIsRejectedAsRfc7807(String body) throws Exception {
		mvc.perform(post(LOOKUP).with(user("operator").roles("ADMIN")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verifyNoInteractions(lookup);
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(ResendOutcome.class)
	void everyResendOutcomeIsReportedAsTwoHundredWithItsOwnToken(ResendOutcome outcome) throws Exception {
		when(resend.resend(new BookingId(42L))).thenReturn(outcome);

		mvc.perform(post(RESEND).with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value(outcome.name()));

		verify(resend).resend(new BookingId(42L));
	}

	@Test
	void aNonAdminOperatorIsForbiddenAndNeverReachesEitherPort() throws Exception {
		mvc.perform(post(LOOKUP).with(user("operator").roles("OPERATOR")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(LOOKUP_BODY))
				.andExpect(status().isForbidden());
		mvc.perform(post(RESEND).with(user("operator").roles("OPERATOR")).with(csrf()))
				.andExpect(status().isForbidden());

		verifyNoInteractions(lookup);
		verifyNoInteractions(resend);
	}

	@Test
	void aCustomerIsForbidden() throws Exception {
		mvc.perform(post(LOOKUP).with(user("tourist").roles("CUSTOMER")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(LOOKUP_BODY))
				.andExpect(status().isForbidden());
		mvc.perform(post(RESEND).with(user("tourist").roles("CUSTOMER")).with(csrf()))
				.andExpect(status().isForbidden());

		verifyNoInteractions(resend);
	}

	@Test
	void anAnonymousRequestIsUnauthorizedAndNeverReachesEitherPort() throws Exception {
		mvc.perform(post(LOOKUP).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(LOOKUP_BODY))
				.andExpect(status().isUnauthorized());
		mvc.perform(post(RESEND).with(csrf()))
				.andExpect(status().isUnauthorized());

		verifyNoInteractions(lookup);
		verifyNoInteractions(resend);
	}

	/**
	 * The arrival code is a bearer credential (invariant #7) and this surface has no reason to show it.
	 * Asserted against the whole serialised body rather than field-by-field, so a field added later
	 * cannot smuggle it in.
	 */
	@Test
	void neverRendersTheArrivalCodeOrTheRecipientAddress() throws Exception {
		when(lookup.forEmail(EMAIL)).thenReturn(List.of(new MailDeliveryBooking(new BookingId(42L),
				"Vala Beach", LocalDate.of(2026, 8, 1), true, List.of())));

		String body = mvc.perform(post(LOOKUP).with(user("operator").roles("ADMIN")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(LOOKUP_BODY))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();

		assertThat(body)
				.doesNotContain(ARRIVAL_CODE)
				.doesNotContain(EMAIL);
	}

	/** CSRF is not optional on a write, and the resend is one — it mails a tourist. */
	@Test
	void aResendWithoutCsrfIsRejected() throws Exception {
		mvc.perform(post(RESEND).with(user("operator").roles("ADMIN")))
				.andExpect(status().isForbidden());

		verifyNoInteractions(resend);
	}

	@Test
	void aLookupWithoutCsrfIsRejected() throws Exception {
		mvc.perform(post(LOOKUP).with(user("operator").roles("ADMIN"))
						.contentType(MediaType.APPLICATION_JSON).content(LOOKUP_BODY))
				.andExpect(status().isForbidden());

		verify(lookup, never()).forEmail(any());
	}
}
