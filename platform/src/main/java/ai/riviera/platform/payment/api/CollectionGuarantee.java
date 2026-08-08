package ai.riviera.platform.payment.api;

/**
 * Whether the wired gateway <strong>proves money was collected</strong> before a booking may reach
 * {@code CONFIRMED} — a property of the payment model, published so callers can reason about
 * what a confirmed booking actually attests to.
 *
 * <p>It exists because that is <em>not</em> universally true here. The {@code stripe}-profile gateway
 * returns {@code Pending} and confirmation arrives only from the signature-verified webhook
 * (invariant #8), so {@code CONFIRMED} does imply collection. The default-profile in-process stub
 * returns {@code Succeeded} synchronously without collecting anything, so a booking reaches
 * {@code CONFIRMED} having taken no money at all.
 *
 * <p>The distinction is load-bearing for anything that treats "confirmed" as "the requester has
 * skin in the game" — the withheld-confirmation-mail flag is disclosed only when this answers
 * {@code true}, because otherwise the flag would be a free suppression oracle for any address
 * (D-8 non-enumeration). Asking the payment model directly, rather than testing a profile string in
 * the consuming module, keeps that security gate checkable and survives a third gateway.
 *
 * <p>Deliberately its own role-split port rather than a method on {@code CheckoutPort} (#94): the
 * consumer here is not collecting anything, it is asking what collection <em>means</em> in this
 * deployment. A driving port — the module's own adapter answers it from the wired gateway.
 */
public interface CollectionGuarantee {

	/** Whether reaching {@code CONFIRMED} implies this deployment's gateway actually collected. */
	boolean provenBeforeConfirmation();
}
