package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * What the move reminder renders (design D13): the stay's {@code code} (a bearer credential, invariant
 * #7), the guest contact, the move day and the stay's last day ({@code Europe/Tirane}, #6), the set the
 * guest leaves and the one they arrive on, the distance between them in rows and positions as the live
 * map places them, and whether the guest holds the day before on the set they leave ({@code fromDayHeld};
 * a refunded one is not "today's spot"). Resolves only while both stretches stand and the move day is held.
 */
public record StayMoveFacts(StayId stayId, String code, CustomerId customerId, LocalDate moveDate,
		LocalDate stayLastDate, SetId fromSetId, SetId toSetId, int rowsAway, int positionsAway, boolean fromDayHeld) {
}
