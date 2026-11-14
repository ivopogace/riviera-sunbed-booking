import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SupportChannels } from './support-channels';
import { SupportContactView, hasSupportChannel } from './support-contact-view';

const BOTH: SupportContactView = {
  email: 'help@example.com',
  whatsapp: { number: '+355691234567', url: 'https://wa.me/355691234567' },
  sameDayReply: false,
};

describe('SupportChannels', () => {
  let fixture: ComponentFixture<SupportChannels>;

  async function render(contact: SupportContactView): Promise<HTMLElement> {
    fixture = TestBed.createComponent(SupportChannels);
    fixture.componentRef.setInput('contact', contact);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('links the mailbox by mailto and WhatsApp by its plain wa.me link in a new tab', async () => {
    const host = await render(BOTH);

    const email = host.querySelector<HTMLAnchorElement>('[data-testid="support-email"]');
    expect(email?.getAttribute('href')).toBe('mailto:help@example.com');
    expect(email?.textContent).toContain('help@example.com');

    const whatsapp = host.querySelector<HTMLAnchorElement>('[data-testid="support-whatsapp"]');
    expect(whatsapp?.getAttribute('href')).toBe('https://wa.me/355691234567');
    expect(whatsapp?.getAttribute('target')).toBe('_blank');
    expect(whatsapp?.getAttribute('rel')).toBe('noopener');
    expect(whatsapp?.textContent).toContain('+355691234567');
  });

  it('renders only the channels configured, never a placeholder', async () => {
    const host = await render({ ...BOTH, email: null });

    expect(host.querySelector('[data-testid="support-email"]')).toBeNull();
    expect(host.querySelector('[data-testid="support-whatsapp"]')).not.toBeNull();
    expect(host.textContent).not.toContain('@');
  });

  it('has a channel only when one is configured', () => {
    expect(hasSupportChannel(undefined)).toBe(false);
    expect(hasSupportChannel({ email: null, whatsapp: null, sameDayReply: true })).toBe(false);
    expect(hasSupportChannel({ ...BOTH, whatsapp: null })).toBe(true);
  });
});
