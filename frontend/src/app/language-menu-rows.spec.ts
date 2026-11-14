import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LOCALE_OPTIONS, LocaleService } from './core/locale';
import { LanguageMenuRows } from './language-menu-rows';

describe('LanguageMenuRows', () => {
  let fixture: ComponentFixture<LanguageMenuRows>;
  let select: ReturnType<typeof vi.fn>;
  let el: HTMLElement;

  beforeEach(() => {
    select = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LocaleService,
          useValue: { options: LOCALE_OPTIONS, current: LOCALE_OPTIONS[1], select },
        },
      ],
    });
    fixture = TestBed.createComponent(LanguageMenuRows);
    fixture.componentRef.setInput('variant', 'popover');
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  const row = () => el.querySelector<HTMLButtonElement>('[data-testid="language-row"]')!;

  it('names the current language in itself, collapsed until opened', () => {
    expect(row().textContent).toContain('Language');
    expect(row().querySelector('[lang="sq"]')?.textContent?.trim()).toBe('Shqip');
    expect(row().getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="language-option-en"]')).toBeNull();
  });

  it('reveals every language, each in its own lang, the current one pressed', () => {
    row().click();
    fixture.detectChanges();

    expect(row().getAttribute('aria-expanded')).toBe('true');
    for (const { id, name } of LOCALE_OPTIONS) {
      const option = el.querySelector<HTMLButtonElement>(`[data-testid="language-option-${id}"]`)!;
      expect(option.querySelector(`[lang="${id}"]`)?.textContent).toBe(name);
      expect(option.getAttribute('aria-pressed')).toBe(String(id === 'sq'));
    }
  });

  it('switches through the locale service and tells the menu to close', () => {
    let closed = 0;
    fixture.componentInstance.selected.subscribe(() => closed++);
    row().click();
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('[data-testid="language-option-it"]')!.click();

    expect(select).toHaveBeenCalledWith('it');
    expect(closed).toBe(1);
  });
});
