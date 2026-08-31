import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AdminForbidden } from './admin-forbidden';

@Component({
  imports: [AdminForbidden],
  template: `<p appAdminForbidden testId="admin-audit-forbidden"></p>`,
})
class Host {}

describe('AdminForbidden', () => {
  function note(): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('p')!;
  }

  it('states the denial in one voice, for every admin page that mounts it', () => {
    expect(note().textContent?.trim()).toBe("You don't have access to this page.");
  });

  it('takes its test id from the call site, so each page keeps its own', () => {
    expect(note().getAttribute('data-testid')).toBe('admin-audit-forbidden');
  });

  it('binds to the caller’s native <p> and carries the shared admin-notice styling', () => {
    const p = note();

    expect(p.tagName).toBe('P');
    expect(p.classList.contains('text-riv-ink-soft')).toBe(true);
  });
});
