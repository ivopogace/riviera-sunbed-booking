package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The {@code X-Audit-Reason} sanitizer (AC-2): client-supplied grounds are flattened —
 * control-character runs (incl. CRLF, the log-forging vector of {@code riviera-java-conventions}
 * §10) collapse to one space, the result is trimmed, blank collapses to absent, and the persisted
 * length is capped at 500.
 */
class AdminAuditReasonsTest {

	@Test
	void sanitizesReasons() {
		assertNull(AdminAuditReasons.sanitize(null), "absent header → no reason");
		assertNull(AdminAuditReasons.sanitize("   "), "blank header → no reason");
		assertNull(AdminAuditReasons.sanitize("\r\n\t"), "control-only header → no reason");

		assertEquals("reported by guest", AdminAuditReasons.sanitize("reported\r\nby guest"),
				"a CRLF run collapses to one space — no forged log line or split header survives");
		assertEquals("tabbed out", AdminAuditReasons.sanitize("\ttabbed\fout "),
				"embedded control characters collapse and the ends are trimmed");
		assertEquals("plain grounds", AdminAuditReasons.sanitize("plain grounds"),
				"ordinary text passes through unchanged");
	}

	@Test
	void capsLengthAtFiveHundred() {
		assertEquals(500, AdminAuditReasons.sanitize("x".repeat(600)).length());
		assertEquals("x".repeat(499),
				AdminAuditReasons.sanitize("x".repeat(499) + " " + "y".repeat(100)),
				"a truncation landing on whitespace is re-trimmed");
	}
}
