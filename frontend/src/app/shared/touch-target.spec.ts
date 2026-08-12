import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TouchTarget } from './touch-target';

@Component({
  selector: 'app-touch-target-host',
  imports: [TouchTarget],
  template: `
    <button type="button" appTouchTarget class="rounded-[13px] px-4" data-testid="button">
      Save
    </button>
    <a appTouchTarget class="inline-flex items-center" href="/x" data-testid="link">Tab</a>
    <input appTouchTarget class="w-[88px]" type="number" data-testid="field" />
  `,
})
class TouchTargetHost {}

describe('TouchTarget', () => {
  let fixture: ComponentFixture<TouchTargetHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TouchTargetHost] });
    fixture = TestBed.createComponent(TouchTargetHost);
    fixture.detectChanges();
  });

  function control(testid: string): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${testid}"]`,
    )!;
  }

  it.each(['button', 'link', 'field'])('floors both axes on a <%s>', (testid) => {
    expect(control(testid).classList).toContain('min-h-11');
    expect(control(testid).classList).toContain('min-w-11');
  });

  it('keeps the classes the consumer wrote beside its own', () => {
    expect(control('button').classList).toContain('rounded-[13px]');
    expect(control('button').classList).toContain('px-4');
    expect(control('link').classList).toContain('inline-flex');
    expect(control('field').classList).toContain('w-[88px]');
  });
});
