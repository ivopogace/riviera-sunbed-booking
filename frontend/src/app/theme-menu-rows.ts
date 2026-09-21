import { Component, computed, inject, input, output, signal } from '@angular/core';

import { ThemeId, ThemeService } from './core/theme';
import { MOBILE_ITEM, POP_ITEM } from './shared/popover-skin';
import { TouchTarget } from './shared/touch-target';

/** Which menu the rows are wearing: the phone sheet's rows, or the desktop popover's. */
export type ThemeMenuVariant = 'sheet' | 'popover';

const SKINS: Record<ThemeMenuVariant, string> = {
  sheet: `${MOBILE_ITEM} cursor-pointer`,
  popover: `${POP_ITEM} cursor-pointer text-left`,
};

/** The row is a disclosure trigger — toggled open and shut in quick succession — so it drops the
 *  browser's double-tap-to-zoom, as every other header disclosure trigger does (`app.ts`'s
 *  `accountChip`/`menuBtn`). Pan and pinch-zoom are untouched, so WCAG 1.4.4 is too. The options
 *  below it are tapped once and close the menu, so they keep the default. */
const ROW_TRIGGER = 'touch-manipulation';

/**
 * The colour theme as a named menu row, with its value beside it, and the three options revealed
 * under it. The theme is a setting, so it is presented as one: a row that says what it is and what
 * it is currently set to, rather than an unlabelled colour circle in the header bar, which reads
 * as decoration.
 *
 * <p><strong>Root-level, not `shared/`</strong>, although it is `legal-menu-rows.ts`'s twin in
 * shape: it injects `core/theme.ts`, and `shared/` may import nothing app-internal
 * (`riviera-frontend` § Folder taxonomy). It sits beside `app.ts` for the same reason
 * `console-shell.ts` does — shell chrome that composes a `core/` singleton.
 *
 * <p><strong>A nested disclosure, deliberately not a second popover and not `role="menu"`.</strong>
 * Expanding in place keeps one open surface, so the account popover's backdrop and focus-return
 * still serve, and the "one header popover at a time" rule holds by construction rather than by
 * two toggles minding each other. `@angular/aria`'s Menu is scoped to "actions, commands and
 * context menus (not for form selection)" and its Listbox to "visible selection lists (not
 * dropdowns)", so neither covers a setting inside a popover; Angular Aria's own styling guidance
 * for a headless disclosure is to target `[aria-expanded]`, which is what this is. The options
 * stay pressed-state toggle buttons rather than ARIA radios, as they were in the header, because
 * the radio pattern would oblige roving `tabindex` + arrow keys to be correct (WCAG 4.1.2).
 *
 * <p>No focus choreography: collapsing leaves focus on the row, which is not destroyed, and
 * choosing an option raises {@link selected}, whose call site closes the menu and hands focus back
 * to that menu's trigger. Nothing lands on `document.body` (WCAG 2.4.3).
 *
 * <p>The row renders a label and a right-aligned value, never `Colour theme · Porcelain` as one
 * string: a middle-dot meta string is a templated tell. The swatch circle rides along
 * `aria-hidden` — the label and value carry the identity, so it is decoration under
 * `docs/design/non-text-contrast.md` rule 2a, measured in `app.contrast.spec.ts` rather than
 * assumed exempt.
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
