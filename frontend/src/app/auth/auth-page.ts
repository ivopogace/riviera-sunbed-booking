import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  CustomerAuth,
  customerRegisterMessage,
  customerSignInMessage,
  MIN_PASSWORD_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
} from '../core/customer-auth';
import { OperatorAuth, operatorRegisterMessage, signInFailureMessage } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { landingRouteFor, safeReturnUrl, touristLandingRoute } from '../shared/auth-landing';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { FieldGlass } from '../shared/field-glass';
import { OutcomeCard } from '../shared/outcome-card';
import { SegmentedControl, SegmentedOption } from '../shared/segmented-control';
import { SsoButtons } from './sso-buttons';

import { TouchTarget } from '../shared/touch-target';

/** Who is signing in. Picks the client service, never a shared endpoint. */
type Audience = 'tourist' | 'operator';
type Mode = 'signin' | 'register';

const AUDIENCE_TABS: readonly SegmentedOption<Audience>[] = [
  { value: 'tourist', label: 'Tourist', testId: 'audience-tourist' },
  { value: 'operator', label: 'Venue operator', testId: 'audience-operator' },
];

const ROLE_OPTIONS: readonly SegmentedOption<Audience>[] = [
  {
    value: 'tourist',
    label: 'Book a sunbed',
    description: 'Find beaches and reserve your spot.',
    testId: 'audience-tourist',
  },
  {
    value: 'operator',
    label: 'Run a venue',
    description: 'List your beach and manage bookings.',
    testId: 'audience-operator',
  },
];

const FIELD_CLASS = 'w-full rounded-[14px] px-[13px] py-[11px] text-[15px] font-[inherit]';
const LABEL_CLASS = 'text-[11px] font-bold tracking-[0.1em] uppercase text-(--riv-card-ink-faint)';

/**
 * The one audience-aware auth card — four flows on a single surface: tourist sign-in,
 * tourist register, operator sign-in, operator register. It replaces five scattered surfaces
 * (`auth/sign-in`, `auth/register`, `operator/operator-register`, and the inline sign-in cards the
 * operator console and venue editor used to render).
 *
 * **This is a presentation unification only.** D-2's backend separation is untouched: there are
 * still two principal types and two login endpoints, and the audience toggle picks the *client
 * service* ({@link CustomerAuth} vs {@link OperatorAuth}), never a shared credential endpoint. The
 * submit paths are separate and the password field is cleared whenever the audience switches, so a
 * tourist credential can never be posted to the operator endpoint.
 *
 * Audience, mode and `returnUrl` live in query params, so the state survives the full-page SSO
 * redirect and the retired routes can forward into the right tab.
 */
@Component({
  selector: 'app-auth-page',
  imports: [
    FormField,
    RouterLink,
    CardGlass,
    FieldGlass,
    SegmentedControl,
    OutcomeCard,
    SsoButtons,
    BusyAction,
    TouchTarget,
  ],
  template: `
    <section class="mx-auto w-full max-w-[430px] px-6 pt-3.5 pb-14" aria-labelledby="auth-title">
      @switch (stage()) {
        @case ('signed-in') {
          <app-outcome-card tone="success" [heading]="landedHeading()" testId="auth-signed-in">
            {{ landedBody() }}
            <a
              outcomeCta
              [routerLink]="landedCtaLink()"
              data-testid="auth-signed-in-cta"
              class="block rounded-[16px] border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) px-4 py-3.5 text-[15px] font-bold text-white no-underline shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)]"
              >{{ landedCtaLabel() }}</a
            >
          </app-outcome-card>
        }
        @case ('pending') {
          <app-outcome-card
            tone="pending"
            heading="Registration submitted for approval"
            testId="auth-pending"
          >
            Thanks — we’ve received your operator registration. Because operators manage real venues
            and payments, a platform admin reviews each request. You’ll be able to sign in once your
            account is approved, and can set up your beach map then.
            <button
              outcomeCta
              type="button"
              data-testid="auth-pending-back"
              class="w-full cursor-pointer rounded-[16px] border-[1.5px] border-[rgba(255,255,255,0.7)] bg-[rgba(255,255,255,0.5)] px-4 py-3.5 text-[14.5px] font-semibold text-(--riv-accent-ink)"
              (click)="backToSignIn()"
            >
              Back to sign-in
            </button>
          </app-outcome-card>
        }
        @default {
          <div
            appCardGlass
            class="rounded-[32px] px-7 pt-7 pb-6.5 shadow-[0_30px_80px_rgba(6,30,40,0.42),inset_0_1px_0_rgba(255,255,255,0.9)]"
          >
            <h1
              id="auth-title"
              class="m-0 mb-1.5 text-[25px] font-bold tracking-[-0.02em] text-(--riv-card-ink)"
            >
              {{ title() }}
            </h1>
            <p
              id="auth-intro"
              class="m-0 mb-4.5 text-[13.5px] leading-[1.5] text-(--riv-card-ink-soft)"
            >
              {{ subtitle() }}
            </p>

            @if (mode() === 'register') {
              <span [class]="labelClass" id="auth-audience-label">I want to</span>
              <div class="mt-2.5 mb-4.5">
                <app-segmented-control
                  variant="card"
                  label="I want to"
                  [options]="roleOptions"
                  [value]="audience()"
                  (valueChange)="onAudienceChange($event)"
                />
              </div>
            } @else {
              <div class="mb-4.5">
                <app-segmented-control
                  variant="pill"
                  label="Sign in as"
                  [options]="audienceTabs"
                  [value]="audience()"
                  (valueChange)="onAudienceChange($event)"
                />
              </div>
            }

            <form
              data-testid="auth-form"
              class="flex flex-col gap-3"
              novalidate
              (submit)="onSubmit(); $event.preventDefault()"
            >
              <label class="flex flex-col gap-1.5">
                <span [class]="labelClass" data-testid="auth-identifier-label">{{
                  identifierLabel()
                }}</span>
                <input
                  #firstField
                  appFieldGlass
                  [class]="fieldClass"
                  [type]="identifierType()"
                  [attr.autocomplete]="identifierAutocomplete()"
                  data-testid="auth-identifier"
                  [formField]="authForm.identifier"
                  autocapitalize="off"
                  spellcheck="false"
                  aria-describedby="auth-intro"
                />
              </label>

              @if (showContactEmail()) {
                <label class="flex flex-col gap-1.5">
                  <span [class]="labelClass">Contact email</span>
                  <input
                    appFieldGlass
                    [class]="fieldClass"
                    type="email"
                    data-testid="auth-contact-email"
                    [formField]="authForm.contactEmail"
                    autocomplete="email"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                </label>
              }

              <label class="flex flex-col gap-1.5">
                <span [class]="labelClass">Password</span>
                <input
                  appFieldGlass
                  [class]="fieldClass"
                  type="password"
                  data-testid="auth-password"
                  [formField]="authForm.password"
                  [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
                  [attr.aria-describedby]="mode() === 'register' ? 'auth-hint' : null"
                />
              </label>

              @if (mode() === 'register') {
                <p id="auth-hint" class="m-0 text-[12px] text-(--riv-card-ink-faint)">
                  8–72 characters.
                </p>
              }

              @if (error(); as msg) {
                <p
                  class="m-0 text-[13px] font-semibold text-[#8c2b22]"
                  role="alert"
                  data-testid="auth-error"
                >
                  {{ msg }}
                </p>
              }

              <button
                type="submit"
                data-testid="auth-submit"
                [appBusy]="submitting()"
                class="mt-0.5 cursor-pointer rounded-[16px] border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) px-4 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] transition aria-disabled:opacity-60 motion-reduce:transition-none"
              >
                {{ submitLabel() }}
              </button>
            </form>

            <app-sso-buttons [audience]="audience()" />

            <p
              class="mt-4 mb-0 text-center text-[13px] text-(--riv-card-ink-soft)"
              data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
            >
              {{ togglePrompt() }}
              <button
                type="button"
                data-testid="auth-toggle-mode"
                class="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-(--riv-accent-ink) underline"
                (click)="toggleMode()"
              >
                {{ toggleAction() }}
              </button>
            </p>

            @if (audience() === 'tourist') {
              <p class="mt-2 mb-0 text-center text-[13px]">
                <a
                  appTouchTarget
                  routerLink="/account/forgot"
                  data-testid="auth-to-forgot"
                  class="inline-flex items-center text-(--riv-accent-ink) underline"
                  >Forgot your password?</a
                >
              </p>
            }
          </div>
        }
      }
    </section>
  `,
})
export class AuthPage {
  private readonly customerAuth = inject(CustomerAuth);
  private readonly operatorAuth = inject(OperatorAuth);
  private readonly ownedVenues = inject(OwnedVenues);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);

  protected readonly audienceTabs = AUDIENCE_TABS;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly fieldClass = FIELD_CLASS;
  protected readonly labelClass = LABEL_CLASS;

  private readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');

  // Read params live — a query-param-only soft nav reuses this component, so a snapshot goes stale.
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  private readonly returnUrl = computed(() => this.queryParams().get('returnUrl') ?? undefined);

  // linkedSignal: recompute from the URL on a live nav, but let the in-card toggle set a local value.
  protected readonly audience = linkedSignal<Audience>(() =>
    this.queryParams().get('audience') === 'operator' ? 'operator' : 'tourist',
  );
  protected readonly mode = linkedSignal<Mode>(() =>
    this.queryParams().get('mode') === 'register' ? 'register' : 'signin',
  );

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  private readonly submittedForApproval = signal(false);
  /** True from the moment a successful sign-in starts navigating away, so the card never flashes. */
  private readonly handingOff = signal(false);

  protected readonly model = signal({ identifier: '', contactEmail: '', password: '' });
  // Validity is gated in onSubmit and shown by the one alert — the retired cards' exact behaviour.
  protected readonly authForm = form(this.model);

  protected readonly stage = computed(() => {
    if (this.submittedForApproval()) {
      return 'pending';
    }
    if (!this.handingOff() && (this.customerAuth.signedIn() || this.operatorAuth.signedIn())) {
      return 'signed-in';
    }
    return 'form';
  });

  private readonly signedInAsOperator = computed(
    () => !this.customerAuth.signedIn() && this.operatorAuth.signedIn(),
  );

  protected readonly title = computed(() =>
    this.mode() === 'register' ? 'Create your account' : 'Welcome back',
  );
  protected readonly subtitle = computed(() =>
    this.mode() === 'register'
      ? 'Join Riviera in a minute — pick what you’re here to do.'
      : 'Sign in to manage your bookings and codes.',
  );
  protected readonly identifierLabel = computed(() =>
    this.audience() === 'operator' ? 'Username' : 'Email',
  );
  protected readonly identifierType = computed(() =>
    this.audience() === 'operator' ? 'text' : 'email',
  );
  protected readonly identifierAutocomplete = computed(() =>
    this.audience() === 'operator' ? 'username' : 'email',
  );
  protected readonly showContactEmail = computed(
    () => this.audience() === 'operator' && this.mode() === 'register',
  );
  protected readonly submitLabel = computed(() => {
    if (this.mode() === 'signin') {
      return this.submitting() ? 'Signing in…' : 'Sign in';
    }
    if (this.audience() === 'operator') {
      return this.submitting() ? 'Submitting…' : 'Request account';
    }
    return this.submitting() ? 'Creating…' : 'Create account';
  });
  protected readonly togglePrompt = computed(() =>
    this.mode() === 'register' ? 'Already have an account?' : 'New to Riviera?',
  );
  protected readonly toggleAction = computed(() =>
    this.mode() === 'register' ? 'Sign in' : 'Create one',
  );

  protected readonly landedHeading = computed(() =>
    this.signedInAsOperator() ? 'Welcome back.' : 'You’re signed in.',
  );
  protected readonly landedBody = computed(() =>
    this.signedInAsOperator()
      ? 'You’re signed in to your operator account.'
      : 'Your bookings and codes live in your account.',
  );
  protected readonly landedCtaLink = computed(() =>
    this.signedInAsOperator() ? '/operator' : '/',
  );
  protected readonly landedCtaLabel = computed(() =>
    this.signedInAsOperator() ? 'Open operator console' : 'Browse beaches',
  );

  constructor() {
    // One place owns the reset-on-change behaviour, so it fires for the in-card toggle AND a live nav.
    let previousMode = this.mode();
    let previousAudience = this.audience();
    effect(() => {
      const mode = this.mode();
      const audience = this.audience();
      if (mode === previousMode && audience === previousAudience) {
        return;
      }
      if (audience !== previousAudience) {
        // Never carry a credential across principal types, even on a live query-param nav.
        this.model.update((m) => ({ ...m, password: '' }));
      }
      previousMode = mode;
      previousAudience = audience;
      this.error.set(undefined);
    });
    afterNextRender({ write: () => this.focusFirstField() });
  }

  protected onAudienceChange(next: Audience): void {
    this.audience.set(next);
    // Password + error reset is owned by the audience/mode effect above.
    // No refocus: arrows move focus WITHIN a radiogroup (caught by unified-auth.e2e.ts).
  }

  protected toggleMode(): void {
    this.mode.update((m) => (m === 'signin' ? 'register' : 'signin'));
    this.error.set(undefined);
    this.refocusAfterRender();
  }

  protected backToSignIn(): void {
    this.submittedForApproval.set(false);
    this.mode.set('signin');
    this.model.set({ identifier: '', contactEmail: '', password: '' });
    this.error.set(undefined);
    this.refocusAfterRender();
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const identifier = this.model().identifier.trim();
    const contactEmail = this.model().contactEmail.trim();
    const password = this.model().password;

    const missing = this.showContactEmail()
      ? !identifier || !contactEmail || !password
      : !identifier || !password;
    if (missing) {
      this.error.set(this.emptyFieldsMessage());
      return;
    }
    if (this.mode() === 'register' && password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(PASSWORD_LENGTH_MESSAGE);
      return;
    }

    this.submitting.set(true);
    this.error.set(undefined);
    try {
      if (this.mode() === 'signin') {
        await this.runSignIn(identifier, password);
      } else {
        await this.runRegister(identifier, password, contactEmail);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  private emptyFieldsMessage(): string {
    if (this.showContactEmail()) {
      return 'Enter a username, contact email, and password.';
    }
    return this.audience() === 'operator'
      ? 'Enter your username and password.'
      : 'Enter your email and password.';
  }

  private async runSignIn(identifier: string, password: string): Promise<void> {
    if (this.audience() === 'tourist') {
      const result = await this.customerAuth.signIn(identifier, password);
      if (result === 'signed-in') {
        await this.land(touristLandingRoute(this.returnUrl()));
      } else {
        this.error.set(customerSignInMessage(result));
      }
      return;
    }
    const result = await this.operatorAuth.signIn(identifier, password);
    if (result !== 'signed-in') {
      this.error.set(signInFailureMessage(result));
      return;
    }
    await this.land(await this.operatorLandingRoute());
  }

  /** Where the operator goes next; an unreadable venue list falls back to the picker, not onboarding. */
  private async operatorLandingRoute(): Promise<string> {
    // A safe returnUrl outranks the venue count, so don't pay for the read at all.
    const target = safeReturnUrl(this.returnUrl());
    if (target) {
      return target;
    }
    const owned = await this.ownedVenues.load();
    return owned.status === 'loaded' ? landingRouteFor(owned.venues, undefined) : '/operator';
  }

  private async runRegister(
    identifier: string,
    password: string,
    contactEmail: string,
  ): Promise<void> {
    if (this.audience() === 'tourist') {
      const result = await this.customerAuth.register(identifier, password);
      if (result === 'registered') {
        await this.land(touristLandingRoute(this.returnUrl()));
      } else {
        this.error.set(customerRegisterMessage(result));
      }
      return;
    }
    // No session is established: the account is PENDING until a platform admin approves it.
    const result = await this.operatorAuth.register(identifier, password, contactEmail);
    if (result === 'submitted') {
      this.model.set({ identifier: '', contactEmail: '', password: '' });
      this.submittedForApproval.set(true);
    } else {
      this.error.set(operatorRegisterMessage(result));
    }
  }

  private async land(url: string): Promise<void> {
    this.handingOff.set(true);
    await this.router.navigateByUrl(url);
  }

  private refocusAfterRender(): void {
    afterNextRender({ write: () => this.focusFirstField() }, { injector: this.injector });
  }

  private focusFirstField(): void {
    this.firstField()?.nativeElement.focus();
  }
}
