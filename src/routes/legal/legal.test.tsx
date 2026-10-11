import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/**
 * The Privacy Policy and the Terms of Service, through the real routes and
 * signed out: somebody reading them before joining has no account.
 */

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'signed-out', userId: null, isAdmin: false, displayName: null }),
  signOut: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/routes/onboarding/page', () => ({ default: () => <h1>Join</h1> }));

const { default: App } = await import('@/App');

function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('the Privacy Policy', () => {
  it('opens with no account, rather than sending the reader to join', () => {
    open('/privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Join' })).toBeNull();
  });

  it('names who runs the club', () => {
    open('/privacy');
    expect(screen.getAllByText(/Able Bodied Inc\./).length).toBeGreaterThan(0);
  });

  // The club sends no texts any more (2026-10-10), so nothing on the page may
  // still promise or describe them: a policy that mentions a program that does
  // not exist is a policy a reader cannot trust about the ones that do.
  it('no longer mentions text messages, codes, STOP or carriers', () => {
    open('/privacy');
    const page = document.body.textContent;
    for (const gone of [/text message/i, /\bSMS\b/, /sign-in code/i, /\bSTOP\b/, /carrier/i]) {
      expect(page).not.toMatch(gone);
    }
  });

  it('says email and phone number are not sold or shared for marketing', () => {
    open('/privacy');
    expect(
      screen.getByText(
        'We do not sell or share your email address or phone number with third parties for marketing or promotional purposes.',
      ),
    ).toBeInTheDocument();
  });

  it('says what it emails, and nothing else', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Emails' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/link that confirms your address/);
    expect(section).toHaveTextContent(/do not send newsletters or promotions/);
  });

  it('says a phone number is optional and only for event hosts', () => {
    open('/privacy');
    expect(screen.getByText(/A phone number, only if you add one/)).toBeInTheDocument();
    expect(document.body.textContent).toContain('It is never used to sign you in.');
  });

  // Kinds of provider, which is what the law asks for, and not which companies
  // (the owner, 2026-10-03).
  it('says what kinds of provider receive information, without naming companies', () => {
    open('/privacy');
    expect(
      screen.getByText(/hosting, our database and sign-in, email delivery, location lookup/),
    ).toBeInTheDocument();
    const page = document.body.textContent;
    for (const company of ['Supabase', 'Twilio', 'Netlify', 'OpenStreetMap']) {
      expect(page).not.toContain(company);
    }
  });

  // The owner, 2026-10-08: an event's host receives the phone numbers of the
  // members going. The policy has to say so, plainly, and never for marketing.
  it('says an event host receives the email, and the phone if given, of a member going, and only for that', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Event hosts' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/receives your email address, and your phone number if you/);
    expect(section).toHaveTextContent(/for that event only/);
    expect(section).toHaveTextContent(/Choosing Interested shares nothing/);
    expect(section).toHaveTextContent(/not to use your details for marketing/);
    expect(screen.queryByText(/It is never shared outside the club/)).toBeNull();
  });

  it('links to the Terms of Service', () => {
    open('/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
  });
});

describe('the Terms of Service', () => {
  it('opens with no account', () => {
    open('/terms');
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
  });

  it('lists the four things that end a membership', () => {
    open('/terms');
    const section = screen.getByRole('heading', { name: 'Losing your membership' }).parentElement;
    if (!section) throw new Error('no section');
    for (const rule of [
      'Selling to members.',
      'Harassing anyone.',
      'Giving medical advice as fact.',
      'Repeating outside a room what was said in it.',
    ]) {
      expect(within(section).getByText(rule)).toBeInTheDocument();
    }
  });

  it('asks for an email address on the list, not a phone number', () => {
    open('/terms');
    expect(screen.getByText(/puts your email address on the club’s list/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/phone number on the/);
  });

  it('has no text-message terms any more, and says what it does email', () => {
    open('/terms');
    expect(screen.queryByRole('heading', { name: 'Text messages' })).toBeNull();
    const page = document.body.textContent;
    for (const gone of [/Text HELP/, /Text STOP/, /Carriers are not liable/, /sign-in codes/i]) {
      expect(page).not.toMatch(gone);
    }
    const section = screen.getByRole('heading', { name: 'Email' }).parentElement;
    if (!section) throw new Error('no section');
    const s = within(section);
    expect(s.getByText('What the club emails you.').tagName).toBe('B');
    expect(s.getByRole('link', { name: 'info@ablebodied.org' })).toHaveAttribute(
      'href',
      'mailto:info@ablebodied.org',
    );
    expect(s.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});
