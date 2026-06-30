package ai.riviera.platform.payout.domain;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.util.regex.Pattern;

/**
 * A settlement period — an ISO-8601 week in {@code Europe/Tirane} (invariant #6), rendered as
 * {@code IYYY-Www} (e.g. {@code 2026-W27}). This is the bucket a payout-ledger entry falls into (by its
 * own {@code created_at}) and the key a {@link PayoutBatch} is generated for (U9, issue #12).
 *
 * <p>The {@code value} format mirrors the DB {@code period_key} column, whose {@code DEFAULT}
 * computes the same {@code to_char(... AT TIME ZONE 'Europe/Tirane', 'IYYY"-W"IW')} string — so a key
 * parsed here and one stored by the database agree. The canonical constructor validates the format so a
 * malformed period (e.g. from a request param) is rejected at the boundary, not silently mismatched.
 */
public record PeriodKey(String value) {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final Pattern FORMAT = Pattern.compile("\\d{4}-W\\d{2}");
	private static final int MAX_ISO_WEEK = 53; // ISO long years have 53 weeks; 54+ and 00 never exist

	public PeriodKey {
		if (value == null || !FORMAT.matcher(value).matches()) {
			throw new IllegalArgumentException("period must be ISO week 'IYYY-Www' (e.g. 2026-W27): " + value);
		}
		int week = Integer.parseInt(value.substring(value.indexOf('W') + 1));
		if (week < 1 || week > MAX_ISO_WEEK) {
			throw new IllegalArgumentException("ISO week must be 01..53: " + value);
		}
	}

	/** Parse a period string (request param), validating the {@code IYYY-Www} format. */
	public static PeriodKey of(String value) {
		return new PeriodKey(value);
	}

	/** The ISO week containing "now" in {@code Europe/Tirane} — the default report period. */
	public static PeriodKey current(Clock clock) {
		return ofDate(LocalDate.ofInstant(clock.instant(), TIRANE));
	}

	/** The ISO week of a {@code Europe/Tirane} calendar day, as {@code IYYY-Www}. */
	public static PeriodKey ofDate(LocalDate tiraneDate) {
		int weekYear = tiraneDate.get(IsoFields.WEEK_BASED_YEAR);
		int week = tiraneDate.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
		return new PeriodKey("%04d-W%02d".formatted(weekYear, week));
	}
}
