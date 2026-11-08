package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.payment.application.PaymentReconciliation;
import ai.riviera.platform.payment.application.ReconciliationReport;
import ai.riviera.platform.payment.application.ReconciliationReport.Divergence;
import ai.riviera.platform.payment.application.ReconciliationReport.Kind;
import ai.riviera.platform.payment.application.ReconciliationReport.OrphanListing;
import ai.riviera.platform.payment.application.ReconciliationReport.Unchecked;
import ai.riviera.platform.payment.application.RepairOutcome;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
import ai.riviera.platform.web.adapter.in.SecurityConfig;
import ai.riviera.platform.web.adapter.in.WebCorsConfig;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The ADMIN reconciliation surface through the real filter chain: the role gate, the report's shape, every outcome. */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminPaymentReconciliationControllerTest {

	private static final String REPORT = "/api/admin/payment-reconciliation";

	private static final String REPAIR = REPORT + "/7/repair";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	PaymentReconciliation reconciliation;

	@Test
	void anAdminReadsTheReport() throws Exception {
		when(reconciliation.report()).thenReturn(new ReconciliationReport(
				List.of(new Divergence(Kind.PAID_LOCALLY_WAITING, 7L, "pi_paid", new PayeeRef(11L), List.of(new BookingRef(42L)))),
				List.of("pi_orphan"),
				List.of(new Unchecked(9L, "pi_dark", "no_payee")),
				OrphanListing.LISTED));

		mvc.perform(get(REPORT).with(user("operator").roles("ADMIN", "OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.divergences[0].kind").value("PAID_LOCALLY_WAITING"))
				.andExpect(jsonPath("$.divergences[0].paymentId").value(7))
				.andExpect(jsonPath("$.divergences[0].reference").value("pi_paid"))
				.andExpect(jsonPath("$.divergences[0].payeeVenueId").value(11))
				.andExpect(jsonPath("$.divergences[0].bookingIds[0]").value(42))
				.andExpect(jsonPath("$.orphans[0]").value("pi_orphan"))
				.andExpect(jsonPath("$.unchecked[0].reason").value("no_payee"))
				.andExpect(jsonPath("$.orphanListing").value("LISTED"));
	}

	@Test
	void anAdminRepairsAndIsToldTheOutcome() throws Exception {
		when(reconciliation.repair(7L)).thenReturn(RepairOutcome.CONFIRMED);

		mvc.perform(post(REPAIR).with(user("operator").roles("ADMIN", "OPERATOR")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("CONFIRMED"));
	}

	@Test
	void repairingAnUnknownPaymentIsNotFound() throws Exception {
		when(reconciliation.repair(7L)).thenReturn(RepairOutcome.UNKNOWN_PAYMENT);

		mvc.perform(post(REPAIR).with(user("operator").roles("ADMIN", "OPERATOR")).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("UNKNOWN_PAYMENT"));
	}

	@Test
	void anOperatorIsForbiddenAndReachesNothing() throws Exception {
		mvc.perform(get(REPORT).with(user("venue-owner").roles("OPERATOR"))).andExpect(status().isForbidden());
		mvc.perform(post(REPAIR).with(user("venue-owner").roles("OPERATOR")).with(csrf())).andExpect(status().isForbidden());

		verifyNoInteractions(reconciliation);
	}

	@Test
	void anAnonymousCallerIsRefused() throws Exception {
		mvc.perform(get(REPORT)).andExpect(status().isUnauthorized());

		verifyNoInteractions(reconciliation);
	}
}
