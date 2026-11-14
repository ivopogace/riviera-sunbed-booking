import { Component, computed, inject, input, output, signal } from '@angular/core';

import { LocaleId, LocaleService } from './core/locale';
import { MOBILE_ITEM, POP_BUTTON } from './shared/popover-skin';
import { TouchTarget } from './shared/touch-target';

/** Which menu the rows are wearing: the phone sheet's rows, or the desktop popover's. */
export type LanguageMenuVariant = 'sheet' | 'popover';

const SKINS: Record<LanguageMenuVariant, string> = {
  sheet: `${MOBILE_ITEM} cursor-pointer`,
  popover: POP_BUTTON,
};

/**
 * The language as a named row with its current value, revealing the languages beneath; the theme
 * row's disclosure shape (`theme-menu-rows.ts`). Root-level, not `shared/`: it injects
 * `core/locale.ts`. Each language is named in itself, marked with its own `lang`, so a screen reader
 * says "Shqip" in Albanian. Picking another language loads the page anew under its subpath.
 */
@Component({
  selector: 'app-language-menu-rows',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `<button
      appTouchTarget
      type="button"
      [class]="skin() + ' touch-manipulation'"
      data-testid="language-row"
      [attr.aria-expanded]="expanded()"
      (click)="toggle()"
    >
      <span class="flex items-center gap-[9px]">
        <span class="flex-1 text-left whitespace-nowrap" i18n>Language</span>
        <span
          class="shrink-0 text-[13px] font-normal text-riv-pop-ink-soft"
          [attr.lang]="locales.current.id"
          >{{ locales.current.name }}</span
        >
      </span>
    </button>
    @if (expanded()) {
      @for (option of locales.options; track option.id) {
        <button
          appTouchTarget
          type="button"
          [class]="skin()"
          [attr.aria-pressed]="option.id === locales.current.id"
          [attr.data-testid]="'language-option-' + option.id"
          (click)="select(option.id)"
        >
          <span class="flex items-center gap-[11px]">
            <span class="flex-1 text-left" [attr.lang]="option.id">{{ option.name }}</span>
            @if (option.id === locales.current.id) {
              <span class="shrink-0 text-[15px] font-bold text-riv-pop-accent" aria-hidden="true"
                >&#10003;</span
              >
            }
          </span>
        </button>
      }
    }`,
})
export class LanguageMenuRows {
  readonly variant = input.required<LanguageMenuVariant>();
  /** Raised once a language has been picked, so the menu the row sits in can close itself. */
  readonly selected = output<void>();

  protected readonly locales = inject(LocaleService);
  protected readonly expanded = signal(false);
  protected readonly skin = computed(() => SKINS[this.variant()]);

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }

  protected select(id: LocaleId): void {
    this.locales.select(id);
    this.selected.emit();
  }
}
