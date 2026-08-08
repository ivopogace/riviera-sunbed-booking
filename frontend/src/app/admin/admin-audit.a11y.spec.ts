import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminAudit } from './admin-audit';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditEntryView } from './admin.model';

/**
 * Structural axe audit of the admin console's Audit tab: the tab strip, the titled card, and
 * the header-labelled data table. Rendered with recorded actions and again empty, since the card's
 * body swaps between the two. Contrast is not measurable by axe under jsdom; it is proven in the e2e.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

const ENTRIES: readonly AdminAuditEntryView[] = [
  {
    id: 3,
    occurredAt: '2026-06-15T09:30:00Z',
    actor: 'operator',
    method: 'DELETE',
    path: '/api/admin/venues/7/photos/cover',
    status: 204,
    reason: 'reported by email',
  },
];

async function render(
  entries: readonly AdminAuditEntryView[],
): Promise<ComponentFixture<AdminAudit>> {
  await TestBed.configureTestingModule({
    imports: [AdminAudit],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminAuditService, useValue: { latest: async () => entries } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminAudit);
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminAudit a11y', () => {
  it('has no axe violations with recorded actions (AC-5)', async () => {
    const fixture = await render(ENTRIES);

    await expectNoAxeViolations(fixture.nativeElement);
  });

  it('has no axe violations with an empty trail (AC-5)', async () => {
    const fixture = await render([]);

    await expectNoAxeViolations(fixture.nativeElement);
  });

  it('labels the table by the card heading, with real column headers (AC-5)', async () => {
    const fixture = await render(ENTRIES);

    const table: HTMLTableElement = fixture.nativeElement.querySelector(
      '[data-testid="admin-audit-table"]',
    );
    expect(table.getAttribute('aria-labelledby')).toBe('admin-audit-heading');
    const headers = Array.from(table.querySelectorAll('th')).map((th) => th.textContent?.trim());
    expect(headers).toEqual(['When', 'Who', 'Action', 'Result', 'Reason']);
    for (const th of table.querySelectorAll('th')) {
      expect(th.getAttribute('scope')).toBe('col');
    }
  });
});
