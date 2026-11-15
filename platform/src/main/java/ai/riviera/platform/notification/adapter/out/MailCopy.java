package ai.riviera.platform.notification.adapter.out;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Currency;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import org.springframework.context.support.ResourceBundleMessageSource;

import ai.riviera.platform.shared.SiteLocale;

/**
 * One mail's copy in one {@link SiteLocale}: {@code mail/messages*.properties} through a private
 * {@link ResourceBundleMessageSource} (English the base file, never the JVM's locale), and the dates,
 * amounts and deadlines in that locale. A missing key throws: no key name is ever mailed.
 */
final class MailCopy {

	static final String BUNDLE = "mail/messages";

	private static final ResourceBundleMessageSource MESSAGES = messages();

	/** Every deadline is stated in the zone the guest and the venue stand in (invariant #6). */
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	/** The gap between a row's label column and its value. */
	private static final int LABEL_GAP = 2;
	private static final String ROW_INDENT = "  ";

	private final Locale locale;
	private final DateTimeFormatter date;
	private final DateTimeFormatter dayMonth;
	private final DateTimeFormatter time;
	private final DateTimeFormatter zone;

	private MailCopy(SiteLocale site) {
		this.locale = site.locale();
		this.date = DateTimeFormatter.ofPattern("d MMMM yyyy", locale);
		this.dayMonth = DateTimeFormatter.ofPattern("d MMMM", locale);
		this.time = DateTimeFormatter.ofPattern("HH:mm", locale);
		this.zone = DateTimeFormatter.ofPattern("zzz", locale);
	}

	static MailCopy in(SiteLocale locale) {
		return new MailCopy(locale);
	}

	static ResourceBundleMessageSource messages() {
		ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
		messages.setBasename(BUNDLE);
		messages.setDefaultEncoding("UTF-8");
		messages.setFallbackToSystemLocale(false);
		messages.setAlwaysUseMessageFormat(true);
		return messages;
	}

	/** The message under {@code key} with {@code args} filled in. */
	String text(String key, Object... args) {
		return MESSAGES.getMessage(key, args, locale);
	}

	/** {@code 3 July 2027}. */
	String date(LocalDate day) {
		return date.format(day);
	}

	/** {@code 3 July 2027}, or {@code 3 July – 7 July 2027}: the first end shares the second's year. */
	String span(LocalDate first, LocalDate last) {
		if (first.equals(last)) {
			return date(first);
		}
		return (first.getYear() == last.getYear() ? dayMonth : date).format(first) + " – " + date(last);
	}

	/** The booking's days as one row: the date of a one-day booking, else the span and its day count. */
	Row daysRow(LocalDate first, LocalDate last) {
		if (first.equals(last)) {
			return new Row("row.date", date(first));
		}
		long days = ChronoUnit.DAYS.between(first, last) + 1;
		return new Row("row.days", text("value.daysSpan", span(first, last), days));
	}

	/** A pay-by or free-exit instant as a wall clock in {@code Europe/Tirane}, with the zone so abroad reads right. */
	String deadline(Instant at) {
		ZonedDateTime local = at.atZone(TIRANE);
		return text("value.deadline", date.format(local), time.format(local), zone.format(local));
	}

	/**
	 * Integer minor units as a display amount (invariant #5), the exponent from the ISO currency and the
	 * decimal separator and order from the locale; no grouping, as no set costs thousands.
	 */
	String amount(long amountMinor, String currency) {
		int fractionDigits = Math.max(Currency.getInstance(currency).getDefaultFractionDigits(), 0);
		BigDecimal major = BigDecimal.valueOf(amountMinor).movePointLeft(fractionDigits)
				.setScale(fractionDigits, RoundingMode.UNNECESSARY);
		return text("value.amount", currency, localDecimal(major));
	}

	/** Basis points as a display percentage, trailing zeros trimmed (2500 → 25, 2250 → 22.5 or 22,5). */
	String percent(int bps) {
		return localDecimal(BigDecimal.valueOf(bps).movePointLeft(2).stripTrailingZeros());
	}

	/**
	 * The rows as an aligned block, each indented, every value starting one column after the longest label
	 * among {@code widthKeys}, so a block keeps its column whichever optional rows it shows.
	 */
	String block(List<String> widthKeys, List<Row> rows) {
		int width = widthKeys.stream().mapToInt(key -> text(key).length()).max().orElse(0) + LABEL_GAP;
		return rows.stream().map(row -> {
			String label = text(row.labelKey());
			return ROW_INDENT + label + " ".repeat(Math.max(0, width - label.length())) + row.value();
		}).collect(Collectors.joining("\n"));
	}

	private String localDecimal(BigDecimal value) {
		return value.toPlainString().replace('.', DecimalFormatSymbols.getInstance(locale).getDecimalSeparator());
	}

	/** One labelled line of a block: the label's bundle key and the value as rendered. */
	record Row(String labelKey, String value) {
	}
}
