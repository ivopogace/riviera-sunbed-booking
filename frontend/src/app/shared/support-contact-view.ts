/** The WhatsApp channel as `GET /api/support-contact` serves it: `+<digits>` and its `wa.me` link. */
export interface SupportWhatsappView {
  readonly number: string;
  readonly url: string;
}

/**
 * The platform's support channels, `null` where none is configured: a surface renders a channel only
 * when it is present, never a placeholder. `sameDayReply` is the server's in-season answer for today
 * in Europe/Tirane (invariant #6).
 */
export interface SupportContactView {
  readonly email: string | null;
  readonly whatsapp: SupportWhatsappView | null;
  readonly sameDayReply: boolean;
}

/** Whether any channel is configured: a surface with none renders no contact block at all. */
export function hasSupportChannel(contact: SupportContactView | undefined): boolean {
  return !!contact && (contact.email !== null || contact.whatsapp !== null);
}
