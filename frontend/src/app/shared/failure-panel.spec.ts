import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AlertIcon } from './alert-icon';
import { FAILURE_DIRECTIVES } from './failure-panel';

@Component({
  imports: [FAILURE_DIRECTIVES, AlertIcon],
  template: `
    <div appFailurePanel data-testid="panel">
      <span appFailureIcon data-testid="icon"><app-alert-icon /></span>
      <h2 appFailureTitle data-testid="title">Nope</h2>
      <p appFailureText data-testid="text">Try again</p>
    </div>
  `,
})
class Host {}

describe('failure-panel directives', () => {
  function root(): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('retains the marker classes as inert test hooks', () => {
    const el = root();
    expect(el.querySelector('[data-testid="panel"]')!.classList.contains('failure')).toBe(true);
    expect(el.querySelector('[data-testid="icon"]')!.classList.contains('failure-icon')).toBe(true);
    expect(el.querySelector('[data-testid="title"]')!.classList.contains('failure-title')).toBe(
      true,
    );
    expect(el.querySelector('[data-testid="text"]')!.classList.contains('failure-text')).toBe(true);
  });

  it('sizes the drawing it holds, not a character', () => {
    const icon = root().querySelector('[data-testid="icon"]')!;
    expect(icon.classList.contains('[&_svg]:size-[26px]')).toBe(true);
    expect([...icon.classList].some((cls) => cls.startsWith('text-['))).toBe(false);
  });

  it('composes the card-glass surface into the panel', () => {
    const panel = root().querySelector('[data-testid="panel"]')!;
    expect(panel.classList.contains('bg-riv-card-glass')).toBe(true);
    expect(panel.classList.contains('rounded-[26px]')).toBe(true);
  });
});
