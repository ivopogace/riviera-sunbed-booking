package ai.riviera.platform.availability.application;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Staff walk-in holds on {@code set_availability} (invariant #2): the module's own outbound port, implemented
 * only by {@code adapter.out.JdbcStaffMarks}, so neither {@code api} nor {@code spi}. Public only because its
 * adapter sits in a sibling package. Call it inside an open transaction: the adapter opens none of its own.
 */
public interface StaffMarks {

	/**
	 * Hold {@code (setId, date)} with the online claim's primitive; {@code true} only if this call created
	 * the row, {@code false} when a mark or an online claim already holds it.
	 */
	boolean mark(SetId setId, LocalDate date);

	/** Free {@code (setId, date)} if a staff mark holds it, never an online claim; {@code true} if one went. */
	boolean release(SetId setId, LocalDate date);
}
