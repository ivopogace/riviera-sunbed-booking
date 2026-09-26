import { Component, computed, inject, input, output, signal } from '@angular/core';

import { ThemeId, ThemeService } from './core/theme';
import { MOBILE_ITEM, POP_BUTTON } from './shared/popover-skin';
import { TouchTarget } from './shared/touch-target';

/** Which menu the rows are wearing: the phone sheet's rows, or the desktop popover's. */
export type ThemeMenuVariant = 'sheet' | 'popover';

const SKINS: Record<ThemeMenuVariant, string> = {
  sheet: `${MOBILE_ITEM} cursor-pointer`,
  popover: POP_BUTTON,
};

/** A disclosure trigger toggled in quick succession, so it drops double-tap-to-zoom like the
 *  other header triggers; pan and pinch-zoom stay (WCAG 1.4.4). Options, tapped once, keep the
 *  default. */
const ROW_TRIGGER = 'touch-manipulation';

/**
 * The colour theme as a named row with its current value, revealing three options beneath.
 * Root-level, not `shared/`: it injects `core/theme.ts` (`riviera-frontend` § Folder taxonomy).
 * A nested disclosure, not a second popover or `role="menu"`, so the account popover's backdrop and
 * focus-return still serve; options are pressed-state toggles, not radios (no roving `tabindex`).
 * Collapsing keeps focus on the row; {@link selected}'s call site returns focus to the menu trigger
 * (WCAG 2.4.3). The `aria-hidden` swatch is decoration: `docs/design/non-text-contrast.md` rule 2a.
 */
@Component({
  selector: 'app-theme-menu-rows',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `<button
      appTouchTarget
      type="button"
      [class]="skin() + ' ' + rowTrigger"
      data-testid="theme-row"
      [attr.aria-expanded]="expanded()"
      (click)="toggle()"
    >
      <span class="flex items-center gap-[9px]">
        <span
          class="h-[22px] w-[22px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]"
          [style.background]="active().swatch"
          aria-hidden="true"
        ></span>
        <span class="flex-1 text-left whitespace-nowrap">Colour theme</span>
        <span class="shrink-0 text-[13px] font-normal text-riv-pop-ink-soft">{{
          active().name
        }}</span>
      </span>
    </button>
    @if (expanded()) {
      @for (option of themes.options; track option.id) {
        <button
          appTouchTarget
          type="button"
          [class]="skin()"
          [attr.aria-pressed]="option.id === themes.theme()"
          [attr.data-testid]="'theme-option-' + option.id"
          (click)="select(option.id)"
        >
          <span class="flex items-center gap-[11px]">
            <span
              class="h-[26px] w-[26px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]"
              [style.background]="option.swatch"
              aria-hidden="true"
            ></span>
            <span class="flex-1 text-left">{{ option.name }}</span>
            @if (option.id === themes.theme()) {
              <span class="shrink-0 text-[15px] font-bold text-riv-pop-accent" aria-hidden="true"
                >&#10003;</span
              >
            }
          </span>
        </button>
      }
    }`,
})
export class ThemeMenuRows {
  readonly variant = input.required<ThemeMenuVariant>();
  /** Raised once a theme has been chosen, so the menu the row sits in can close itself. */
  readonly selected = output<void>();

  protected readonly rowTrigger = ROW_TRIGGER;
  protected readonly themes = inject(ThemeService);
  protected readonly expanded = signal(false);
  protected readonly skin = computed(() => SKINS[this.variant()]);
  protected readonly active = computed(
    () =>
      this.themes.options.find((option) => option.id === this.themes.theme()) ??
      this.themes.options[0],
  );

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }

  protected select(id: ThemeId): void {
    this.themes.select(id);
    this.selected.emit();
  }
}
