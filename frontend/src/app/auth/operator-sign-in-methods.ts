import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormField, form } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';

import { SsoProviderId } from '../core/customer-auth';
import {
  OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE,
  OperatorAuth,
  OperatorSignInMethod,
  operatorLinkStartMessage,
  SESSION_EXPIRED_MESSAGE,
} from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { focusMover } from '../shared/focus-after-render';
import { TouchTarget } from '../shared/touch-target';

const CLS = {
  card: 'w-full max-w-[400px] rounded-[26px] px-[26px] pt-[26px] pb-6 shadow-[0_30px_70px_rgba(6,30,40,0.28),inset_0_1px_0_rgba(255,255,255,0.7)]',
  title: 'm-0 mb-1.5 text-[20px] font-bold tracking-[-0.02em] text-riv-card-ink',
  intro: 'm-0 mb-4 text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  notice: 'm-0 mb-4 block text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  label: 'text-[11px] font-bold tracking-[0.08em] uppercase text-riv-card-ink-soft',
  input:
    'font-[inherit] text-[16px] text-riv-card-ink bg-riv-field-fill border border-riv-field-border rounded-[14px] px-[14px] py-3 focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  row: 'flex items-center justify-between gap-3 border-t border-riv-field-border py-2.5',
  provider: 'text-[14px] font-semibold text-riv-card-ink',
  status: 'block text-[12px] text-riv-card-ink-soft',
  action:
    'cursor-pointer rounded-[12px] border border-riv-field-border bg-riv-field-fill px-3 py-2 text-[13.5px] font-semibold text-riv-card-ink aria-disabled:cursor-default aria-disabled:opacity-70 focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  error: 'm-0 mb-3 text-[13px] font-semibold text-riv-error-ink',
} as const;

/**
 * The signed-in operator's sign-in methods (#276), under its password card: link Google or Apple after proving
 * the current password (the backend refuses a link without it), or unlink one, which signs every other device
 * out. The link round trip returns here with `?sso=linked` or `?sso=link-failed`, one wording for every refusal.
 */
@Component({
  selector: 'app-operator-sign-in-methods',
  imports: [BusyAction, CardGlass, FormField, TouchTarget],
  template: `
    <section [class]="cls.card" appCardGlass aria-labelledby="osm-title">
      <h2 id="osm-title" [class]="cls.title" i18n>Sign-in methods</h2>
      <p [class]="cls.intro" i18n>
        Link Google or Apple to sign in without your password. Linking asks for your current
        password.
      </p>

      <output [class]="cls.notice" data-testid="osm-notice">{{ notice() }}</output>

      @if (error(); as msg) {
        <p [class]="cls.error" role="alert" data-testid="osm-error">{{ msg }}</p>
      }

      <label class="mb-3 flex flex-col gap-1.5">
        <span [class]="cls.label" i18n>Current password</span>
        <input
          appTouchTarget
          [class]="cls.input"
          type="password"
          data-testid="osm-current"
          autocomplete="current-password"
          [formField]="passwordForm.currentPassword"
        />
      </label>

      @for (provider of providers; track provider.id) {
        <div [class]="cls.row" [attr.data-testid]="'osm-row-' + provider.id">
          <span>
            <span [class]="cls.provider">{{ provider.name }}</span>
            <span [class]="cls.status">{{
              isLinked(provider.id) ? linkedLabel : notLinkedLabel
            }}</span>
          </span>
          @if (isLinked(provider.id)) {
            <button
              appTouchTarget
              type="button"
              [class]="cls.action"
              [attr.data-testid]="'osm-unlink-' + provider.id"
              [appBusy]="busy() === provider.id"
              (click)="unlink(provider.id)"
            >
              {{ provider.unlinkLabel }}
            </button>
          } @else {
            <button
              appTouchTarget
              type="button"
              [class]="cls.action"
              [attr.data-testid]="'osm-link-' + provider.id"
              [appBusy]="busy() === provider.id"
              (click)="link(provider.id)"
            >
              {{ provider.linkLabel }}
            </button>
          }
        </div>
      }
    </section>
  `,
})
export class OperatorSignInMethods implements OnInit {
  private readonly auth = inject(OperatorAuth);
  private readonly moveFocus = focusMover();
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap, {
    requireSync: true,
  });

  protected readonly cls = CLS;
  protected readonly linkedLabel = $localize`:Sign-in method status:Linked`;
  protected readonly notLinkedLabel = $localize`:Sign-in method status:Not linked`;
  protected readonly providers: readonly {
    id: SsoProviderId;
    name: string;
    linkLabel: string;
    unlinkLabel: string;
  }[] = [
    {
      id: 'google',
      name: 'Google',
      linkLabel: $localize`Link Google`,
      unlinkLabel: $localize`Unlink Google`,
    },
    {
      id: 'apple',
      name: 'Apple',
      linkLabel: $localize`Link Apple`,
      unlinkLabel: $localize`Unlink Apple`,
    },
  ];

  protected readonly model = signal({ currentPassword: '' });
  protected readonly passwordForm = form(this.model);
  protected readonly busy = signal<SsoProviderId | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);
  private readonly methods = signal<readonly OperatorSignInMethod[]>([]);
  private readonly outcome = signal<string | undefined>(undefined);

  /** The round trip's answer from the URL until this page reports one of its own. */
  protected readonly notice = computed(() => this.outcome() ?? this.returnNotice());

  private readonly returnNotice = computed(() => {
    switch (this.queryParams().get('sso')) {
      case 'linked':
        return $localize`Linked. You can now sign in with it on the operator tab.`;
      case 'link-failed':
        return $localize`That account couldn't be linked. It may already be linked to another operator account, or your session changed. Please try again.`;
      default:
        return undefined;
    }
  });

  ngOnInit(): void {
    void this.refresh();
  }

  protected isLinked(provider: SsoProviderId): boolean {
    return this.methods().some((method) => method.provider === provider);
  }

  protected async link(provider: SsoProviderId): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.outcome.set(undefined);
    const { currentPassword } = this.model();
    if (currentPassword.length === 0) {
      this.error.set(OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE);
      return;
    }
    this.busy.set(provider);
    const result = await this.auth.startLink(provider, currentPassword);
    if (result === 'started') {
      return;
    }
    this.busy.set(undefined);
    if (result === 'session-lost') {
      this.auth.sessionLost();
    }
    this.error.set(operatorLinkStartMessage(result));
  }

  protected async unlink(provider: SsoProviderId): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(provider);
    const result = await this.auth.unlink(provider);
    this.busy.set(undefined);
    this.error.set(undefined);
    switch (result) {
      case 'unlinked':
        this.outcome.set(
          $localize`Unlinked. Any other devices signed in as you have been signed out.`,
        );
        await this.refresh();
        // The refresh swaps the focused Unlink button for Link: land on the notice instead of <body>.
        this.moveFocus('osm-notice');
        return;
      case 'last-credential':
        this.error.set($localize`This is the only way left to sign in, so it can't be unlinked.`);
        break;
      case 'session-lost':
        this.auth.sessionLost();
        this.error.set(SESSION_EXPIRED_MESSAGE);
        break;
      case 'error':
        this.error.set($localize`Something went wrong unlinking. Please try again.`);
    }
    this.moveFocus('osm-error');
  }

  private async refresh(): Promise<void> {
    this.methods.set(await this.auth.signInMethods());
  }
}
