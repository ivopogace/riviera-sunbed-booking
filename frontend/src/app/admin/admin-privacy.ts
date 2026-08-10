import { Component, inject, signal } from '@angular/core';
import { email, FormField, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { hostFocusMover } from '../shared/focus-after-render';
import { AdminConsoleTabs } from './admin-console-tabs';
import { AdminPrivacyService, erasureErrorOf } from './admin-privacy.service';

/** Which of the three panels the erasure card is showing. */
type ErasureStage = 'form' | 'confirm' | 'done';

/**
 * The admin console's Privacy tab — the first UI for `POST /api/admin/erasure`, the
 * data-subject erasure endpoint that shipped long before any UI for it. It exists for the people who
 * cannot self-serve: a guest who never had an account, and an account holder who cannot reach their
 * own account page (which has its own erasure UI, for a different principal entirely).
 *
 * <p><strong>The `204` is the whole design.</strong> The endpoint answers `204 No Content` when a
 * subject was scrubbed, when they had already been scrubbed, and when the platform never held that
 * address — deliberately non-enumerating (design D-8). So this screen has no success/not-found
 * distinction to draw, no count to render, and no "no such person" branch: there is no such signal
 * on the wire, and manufacturing one would re-open the oracle the backend closes. The done panel
 * states that property to the admin outright, because a bare confirmation would otherwise be read as
 * "yes, they were in the system" — which is exactly the inference the `204` exists to prevent.
 *
 * <p><strong>Three stages, armed in place.</strong> Form → confirm → done, the console's recurring
 * confirm-in-place shape rather than a modal: nothing to focus-trap, and the confirmation names the
 * address it is about. The confirm step collects optional grounds that ride `X-Audit-Reason` into the
 * platform's admin audit trail (recorded at the edge — this surface adds no instrumentation of its own).
 *
 * <p><strong>Each stage swap moves focus deliberately.</strong> Every transition destroys the
 * control that was just activated, which strands keyboard/AT focus on `<body>` unless it is moved
 * (WCAG 2.4.3 — the recurring stranded-focus class). The two panels take focus themselves, as
 * labelled groups, so the swap is announced rather than silently replacing the page's content;
 * dismissal and "erase another" return focus to the control that produced them.
 *
 * <p><strong>What the aside may claim.</strong> ADR-0010's model is pseudonymize-in-place: contact
 * details are overwritten on the rows that hold them, and the bookings, payments and payout-ledger
 * entries under statutory retention stay exactly where they are, minus the person. The copy says
 * that — not "your data is deleted", which would be both wrong and a promise the platform cannot
 * keep while it is legally required to retain the financial record.
 *
 * <p>Like every admin tab, the page self-gates on {@link OperatorAuth} for UX while the backend
 * `/api/admin/**` role gate does the enforcing. Porcelain-themed to match the operator console.
 */
@Component({
  selector: 'app-admin-privacy',
  imports: [RouterLink, FormField, CardGlass, AdminConsoleTabs],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section class="mx-auto max-w-[880px] px-4 py-10" aria-labelledby="admin-privacy-title">
      <h1 id="admin-privacy-title" class="text-[24px] font-semibold text-(--riv-ink)">Privacy</h1>

      @if (auth.restoring()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-privacy-restoring">
          Loading…
        </p>
      } @else if (!auth.signedIn()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-privacy-signed-out">
          Sign in as an admin to action a data-subject erasure request.
          <a
            routerLink="/account/sign-in"
            [queryParams]="{ audience: 'operator', returnUrl: '/admin/privacy' }"
            class="font-semibold underline"
            >Sign in</a
          >
        </p>
      } @else if (!auth.isAdmin()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-privacy-forbidden">
          You don't have access to this page.
        </p>
      } @else {
        <app-admin-console-tabs label="Admin console sections" />

        <div class="mt-5 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <section
            appCardGlass
            class="rounded-[14px] p-5"
            aria-labelledby="admin-privacy-erase-heading"
          >
            <h2
              id="admin-privacy-erase-heading"
              class="text-[16px] font-semibold text-(--riv-card-ink)"
            >
              Erase a data subject
            </h2>
            <p
              id="admin-privacy-erase-intro"
              class="mt-1 text-[13.5px] leading-relaxed text-(--riv-card-ink-soft)"
            >
              For a guest with no account, or an account holder who cannot do it themselves. Contact
              details are scrubbed in place; the financial records that must be retained stay,
              without the person attached to them.
            </p>

            @if (stage() === 'form') {
              <form
                class="mt-4"
                data-testid="admin-privacy-form"
                novalidate
                (submit)="review(); $event.preventDefault()"
              >
                <label
                  for="admin-privacy-email"
                  class="block text-[11px] font-bold tracking-[0.1em] text-(--riv-card-ink-soft) uppercase"
                  >Email address</label
                >
                <input
                  id="admin-privacy-email"
                  type="email"
                  data-testid="admin-privacy-email"
                  [formField]="erasureForm.email"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  placeholder="guest@example.com"
                  aria-describedby="admin-privacy-erase-intro"
                  class="mt-1 w-full rounded-[10px] border border-(--riv-field-border) bg-white/70 px-3 py-2 text-[15px] text-(--riv-card-ink)"
                />

                @if (reviewAttempted() && erasureForm.email().errors().length) {
                  <p
                    class="mt-2 text-[13.5px] font-semibold text-[#b3261e]"
                    role="alert"
                    data-testid="admin-privacy-email-error"
                  >
                    {{ erasureForm.email().errors()[0].message }}
                  </p>
                }

                <button
                  type="submit"
                  data-testid="admin-privacy-review"
                  class="mt-4 w-full rounded-[12px] border border-(--riv-field-border) bg-white/70 px-4 py-3 text-[14.5px] font-bold text-(--riv-card-ink)"
                >
                  Review erasure request
                </button>
              </form>
            } @else if (stage() === 'confirm') {
              <div
                role="group"
                tabindex="-1"
                data-testid="admin-privacy-confirm-panel"
                aria-labelledby="admin-privacy-confirm-heading"
                class="mt-4 rounded-[14px] border border-[rgba(179,54,43,0.35)] bg-[rgba(179,54,43,0.06)] p-4 [animation:riv-pop_0.22s_ease] motion-reduce:[animation:none]"
              >
                <h3
                  id="admin-privacy-confirm-heading"
                  class="text-[14px] font-bold text-[#8f2c22]"
                >
                  Erase everything linked to this email?
                </h3>
                <p class="mt-2 text-[13px] leading-relaxed text-(--riv-card-ink-soft)">
                  Name, email and phone become unrecoverable for
                  <strong class="text-(--riv-card-ink)">{{ submittedEmail() }}</strong
                  >. Bookings and ledger entries remain as anonymous records. This cannot be undone.
                </p>

                <label
                  for="admin-privacy-reason"
                  class="mt-3 block text-[13.5px] font-semibold text-(--riv-card-ink)"
                  >Reason (optional)</label
                >
                <input
                  id="admin-privacy-reason"
                  type="text"
                  maxlength="500"
                  data-testid="admin-privacy-reason"
                  [value]="reason()"
                  [disabled]="busy()"
                  (input)="onReasonTyped($event)"
                  placeholder="e.g. DSAR-2026-08-04"
                  class="mt-1 w-full rounded-[10px] border border-(--riv-field-border) bg-white/70 px-3 py-2 text-[14px] text-(--riv-card-ink)"
                />

                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="admin-privacy-confirm"
                    [disabled]="busy()"
                    (click)="erase()"
                    class="rounded-[12px] border border-[rgba(179,54,43,0.6)] bg-[rgba(179,54,43,0.1)] px-5 py-3 text-[13.5px] font-bold text-[#8f2c22] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {{ busy() ? 'Erasing…' : 'Erase permanently' }}
                  </button>
                  <button
                    type="button"
                    data-testid="admin-privacy-cancel"
                    [disabled]="busy()"
                    (click)="cancel()"
                    class="rounded-[12px] border border-(--riv-field-border) bg-white/70 px-5 py-3 text-[13.5px] font-semibold text-(--riv-card-ink) disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>

                <p
                  class="mt-2 min-h-[1.25rem] text-[13.5px] font-semibold text-[#b3261e]"
                  role="alert"
                  data-testid="admin-privacy-error"
                >
                  {{ erasureError() }}
                </p>
              </div>
            } @else {
              <div
                role="group"
                tabindex="-1"
                data-testid="admin-privacy-done-panel"
                aria-labelledby="admin-privacy-done-heading"
                class="mt-4 rounded-[14px] border border-[rgba(14,138,168,0.35)] bg-[rgba(43,184,212,0.12)] p-4 [animation:riv-pop_0.22s_ease] motion-reduce:[animation:none]"
              >
                <h3 id="admin-privacy-done-heading" class="text-[14px] font-bold text-[#0a4f5e]">
                  Request actioned
                </h3>
                <p class="mt-2 text-[13px] leading-relaxed text-(--riv-card-ink-soft)">
                  Anything held for
                  <strong class="text-(--riv-card-ink)">{{ submittedEmail() }}</strong> has been
                  erased. The result is deliberately the same whether or not that email was known to
                  us — this screen will never tell you which.
                </p>
                <button
                  type="button"
                  data-testid="admin-privacy-another"
                  (click)="another()"
                  class="mt-3 rounded-[12px] border border-(--riv-field-border) bg-white/70 px-5 py-3 text-[13.5px] font-semibold text-(--riv-card-ink)"
                >
                  Erase another
                </button>
              </div>
            }
          </section>

          <aside
            appCardGlass
            class="rounded-[14px] p-5"
            data-testid="admin-privacy-survives"
            aria-labelledby="admin-privacy-survives-heading"
          >
            <h2
              id="admin-privacy-survives-heading"
              class="text-[14.5px] font-semibold text-(--riv-card-ink)"
            >
              What survives an erasure
            </h2>

            <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-2.5 text-[12.5px] leading-relaxed text-(--riv-card-ink-soft)">
              <dt class="font-bold text-[#b3261e]">Erased</dt>
              <dd>Name, email, phone — overwritten in place, not deleted rows.</dd>
              <dt class="font-bold text-[#0a5f73]">Kept</dt>
              <dd>
                Bookings, payments, payout ledger entries — the records we are legally required to
                retain, now anonymous.
              </dd>
            </dl>

            <p
              class="mt-3 border-t border-(--riv-card-border) pt-3 text-[12.5px] leading-relaxed text-(--riv-card-ink-soft)"
            >
              Account holders can erase themselves from their own account page. This screen exists
              for the people who can't.
            </p>
          </aside>
        </div>
      }
    </section>
  `,
})
export class AdminPrivacy {
  protected readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminPrivacyService);
  private readonly focusAfterRender = hostFocusMover();

  protected readonly stage = signal<ErasureStage>('form');
  /** The address the confirmation and outcome are about — never the live field, which may be retyped. */
  protected readonly submittedEmail = signal('');
  protected readonly reason = signal('');
  protected readonly reviewAttempted = signal(false);
  protected readonly busy = signal(false);
  protected readonly erasureError = signal('');

  protected readonly model = signal({ email: '' });
  protected readonly erasureForm = form(this.model, (path) => {
    required(path.email, { message: 'Enter a valid email address.' });
    email(path.email, { message: 'Enter a valid email address.' });
  });

  /**
   * Arm the confirmation, sending nothing. The field is trimmed into the model first, so a pasted
   * address with stray whitespace is accepted and the admin sees the exact string that will be sent
   * — the builtin validators read the raw value, and rejecting a paste for its padding would be
   * friction with no safety behind it. The client check is a convenience either way: the server
   * validates independently and its refusal has its own message.
   */
  protected review(): void {
    this.model.update((current) => ({ email: current.email.trim() }));
    if (this.erasureForm().invalid()) {
      this.reviewAttempted.set(true);
      return;
    }
    this.reviewAttempted.set(false);
    this.submittedEmail.set(this.model().email);
    this.erasureError.set('');
    this.stage.set('confirm');
    this.focusAfterRender('admin-privacy-confirm-panel');
  }

  protected cancel(): void {
    this.reason.set('');
    this.erasureError.set('');
    this.stage.set('form');
    this.focusAfterRender('admin-privacy-review');
  }

  protected onReasonTyped(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  /**
   * Action the erasure. The whole confirmation is locked while the request is in flight — both
   * buttons and the grounds field — so a second POST is impossible and grounds typed mid-flight
   * cannot be silently discarded when the panel swaps.
   *
   * <p>A failure keeps the confirmation armed holding what was typed, so a retry costs no
   * re-typing, and says plainly that nothing was erased. There is no third outcome to handle: the
   * endpoint's only success is `204`, and it means the same thing whether or not the address was
   * known.
   */
  protected async erase(): Promise<void> {
    const grounds = this.reason().trim();
    this.busy.set(true);
    this.erasureError.set('');
    try {
      await (grounds === ''
        ? this.service.erase(this.submittedEmail())
        : this.service.erase(this.submittedEmail(), grounds));
      this.reason.set('');
      this.stage.set('done');
      this.focusAfterRender('admin-privacy-done-panel');
    } catch (error) {
      this.erasureError.set(messageFor(erasureErrorOf(error)));
      // Disabling Erase blurred it to `<body>`; re-enabling does not bring focus back (WCAG 2.4.3).
      this.focusAfterRender('admin-privacy-confirm');
    } finally {
      this.busy.set(false);
    }
  }

  protected another(): void {
    this.model.set({ email: '' });
    this.submittedEmail.set('');
    this.reviewAttempted.set(false);
    this.erasureError.set('');
    this.stage.set('form');
    this.focusAfterRender('admin-privacy-email');
  }

}

/** What the admin is told when an erasure request is refused. Never whether the subject existed. */
function messageFor(failure: ReturnType<typeof erasureErrorOf>): string {
  return failure === 'INVALID_REQUEST'
    ? 'The platform rejected that email address. Nothing was erased.'
    : 'Could not action that request. Nothing was erased.';
}
