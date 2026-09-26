import { Component, inject, signal } from '@angular/core';

import { email, FormField, form, required } from '@angular/forms/signals';

import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { FieldErrorFor } from '../shared/field-error-for';
import { focusMover } from '../shared/focus-after-render';
import { AdminPrivacyService, erasureErrorOf } from './admin-privacy.service';

import { TouchTarget } from '../shared/touch-target';

/** Which of the three panels the erasure card is showing. */
type ErasureStage = 'form' | 'confirm' | 'done';

/**
 * The admin Privacy tab: data-subject erasure by email (`POST /api/admin/erasure`) for guests and
 * account holders who cannot self-serve. The `204` is identical for scrubbed, already-scrubbed and
 * never-known addresses, so never draw a found/not-found distinction — the done panel says so.
 * Form → confirm → done in place; optional grounds ride `X-Audit-Reason` into the audit trail.
 * Each stage swap moves focus (WCAG 2.4.3): panels take it as labelled groups, back-outs return it
 * to their trigger. Copy says pseudonymized in place, never "deleted" (ADR-0010).
 */
@Component({
  selector: 'app-admin-privacy',
  imports: [FormField, CardGlass, BusyAction, FieldErrorFor, TouchTarget],
  template: `
    <div class="mt-5 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <section
        appCardGlass
        class="rounded-[14px] p-5"
        aria-labelledby="admin-privacy-erase-heading"
      >
        <h2 id="admin-privacy-erase-heading" class="text-[16px] font-semibold text-riv-card-ink">
          Erase a data subject
        </h2>
        <p
          id="admin-privacy-erase-intro"
          class="mt-1 text-[13.5px] leading-relaxed text-riv-card-ink-soft"
        >
          For a guest with no account, or an account holder who cannot do it themselves. Contact
          details are scrubbed in place; the financial records that must be retained stay, without
          the person attached to them.
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
              class="block text-[11px] font-bold tracking-[0.1em] text-riv-card-ink-soft uppercase"
              >Email address</label
            >
            <input
              appTouchTarget
              id="admin-privacy-email"
              type="email"
              data-testid="admin-privacy-email"
              [formField]="erasureForm.email"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="guest@example.com"
              aria-describedby="admin-privacy-erase-intro"
              class="mt-1 w-full rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-3 py-2 text-[16px] text-riv-card-ink"
              #emailControl
            />

            @if (reviewAttempted() && erasureForm.email().errors().length) {
              <p
                [appFieldErrorFor]="emailControl"
                class="mt-2 text-[13.5px] font-semibold text-riv-error-ink"
                role="alert"
                data-testid="admin-privacy-email-error"
              >
                {{ erasureForm.email().errors()[0].message }}
              </p>
            }

            <button
              appTouchTarget
              type="submit"
              data-testid="admin-privacy-review"
              class="mt-4 w-full rounded-[12px] border border-riv-field-border bg-riv-console-inset/70 px-4 py-3 text-[14.5px] font-bold text-riv-card-ink"
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
            class="mt-4 rounded-[14px] border border-riv-danger-border bg-riv-danger-fill p-4 [animation:riv-pop_0.22s_ease] motion-reduce:[animation:none]"
          >
            <h3
              id="admin-privacy-confirm-heading"
              class="text-[14px] font-bold text-riv-danger-ink"
            >
              Erase everything linked to this email?
            </h3>
            <p class="mt-2 text-[13px] leading-relaxed text-riv-card-ink-soft">
              Name, email and phone become unrecoverable for
              <strong class="text-riv-card-ink">{{ submittedEmail() }}</strong
              >. Bookings and ledger entries remain as anonymous records. This cannot be undone.
            </p>

            <label
              for="admin-privacy-reason"
              class="mt-3 block text-[13.5px] font-semibold text-riv-card-ink"
              >Reason (optional)</label
            >
            <input
              appTouchTarget
              id="admin-privacy-reason"
              type="text"
              maxlength="500"
              data-testid="admin-privacy-reason"
              [value]="reason()"
              [disabled]="busy()"
              (input)="onReasonTyped($event)"
              placeholder="e.g. DSAR-2026-08-04"
              class="mt-1 w-full rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-3 py-2 text-[16px] text-riv-card-ink"
            />

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button
                appTouchTarget
                type="button"
                data-testid="admin-privacy-confirm"
                [appBusy]="busy()"
                (click)="erase()"
                class="rounded-[12px] border border-riv-danger-action-border bg-riv-danger-action-fill px-5 py-3 text-[13.5px] font-bold text-riv-danger-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                {{ busy() ? 'Erasing…' : 'Erase permanently' }}
              </button>
              <button
                appTouchTarget
                type="button"
                data-testid="admin-privacy-cancel"
                [appBusy]="busy()"
                (click)="cancel()"
                class="rounded-[12px] border border-riv-field-border bg-riv-console-inset/70 px-5 py-3 text-[13.5px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                Cancel
              </button>
            </div>

            <div class="mt-2 min-h-[1.25rem]">
              @if (erasureError()) {
                <p
                  class="text-[13.5px] font-semibold text-riv-error-ink"
                  role="alert"
                  data-testid="admin-privacy-error"
                >
                  {{ erasureError() }}
                </p>
              }
            </div>
          </div>
        } @else {
          <div
            role="group"
            tabindex="-1"
            data-testid="admin-privacy-done-panel"
            aria-labelledby="admin-privacy-done-heading"
            class="mt-4 rounded-[14px] border border-riv-accent-border bg-riv-accent-fill p-4 [animation:riv-pop_0.22s_ease] motion-reduce:[animation:none]"
          >
            <h3 id="admin-privacy-done-heading" class="text-[14px] font-bold text-riv-accent-ink">
              Request actioned
            </h3>
            <p class="mt-2 text-[13px] leading-relaxed text-riv-card-ink-soft">
              Anything held for
              <strong class="text-riv-card-ink">{{ submittedEmail() }}</strong> has been erased. The
              result is deliberately the same whether or not that email was known to us — this
              screen will never tell you which.
            </p>
            <button
              appTouchTarget
              type="button"
              data-testid="admin-privacy-another"
              (click)="another()"
              class="mt-3 rounded-[12px] border border-riv-field-border bg-riv-console-inset/70 px-5 py-3 text-[13.5px] font-semibold text-riv-card-ink"
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
          class="text-[14.5px] font-semibold text-riv-card-ink"
        >
          What survives an erasure
        </h2>

        <dl
          class="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-2.5 text-[12.5px] leading-relaxed text-riv-card-ink-soft"
        >
          <dt class="font-bold text-riv-error-ink">Erased</dt>
          <dd>Name, email, phone — overwritten in place, not deleted rows.</dd>
          <dt class="font-bold text-riv-accent-ink">Kept</dt>
          <dd>
            Bookings, payments, payout ledger entries — the records we are legally required to
            retain, now anonymous.
          </dd>
        </dl>

        <p
          class="mt-3 border-t border-riv-card-border pt-3 text-[12.5px] leading-relaxed text-riv-card-ink-soft"
        >
          Account holders can erase themselves from their own account page. This screen exists for
          the people who can't.
        </p>
      </aside>
    </div>
  `,
})
export class AdminPrivacy {
  private readonly service = inject(AdminPrivacyService);
  private readonly focusAfterRender = focusMover();

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
   * Arm the confirmation, sending nothing. The field is trimmed into the model first so a padded paste
   * validates and the admin confirms the exact string sent; the server validates independently.
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
   * Send the erasure with the whole confirmation locked in flight (no second POST, no lost
   * grounds). A failure stays armed with what was typed and says nothing was erased; success is
   * only ever `204`.
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
      // Redundant since the busy posture stopped blurring, but kept: the leg must still land.
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
