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

  // The owner, 2026-10-22: the club is no longer run by Able Bodied Inc.
  it('names who runs the club, and no nonprofit', () => {
    open('/privacy');
    expect(screen.getAllByText(/operated by Alfred Shaheen/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/run by Able Bodied|nonprofit/);
  });

  // Twilio error 30908: the carriers' sentences, word for word.
  it('carries the text-message wording carriers ask for', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Text messages (SMS)' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(
      'We do not share, sell, or provide your mobile phone number or messaging consent data to third parties or affiliates for marketing or promotional purposes.',
    );
    expect(section).toHaveTextContent(
      'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.',
    );
    expect(section).toHaveTextContent(
      'Text messaging opt-in data and consent will not be shared with any third parties.',
    );
    expect(section).toHaveTextContent('Message and data rates may apply.');
    expect(section).toHaveTextContent(/Text HELP for help and STOP/);
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

  it('says a phone number is optional, for event hosts and sign-in codes', () => {
    open('/privacy');
    expect(screen.getByText(/A phone number, only if you add one/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('It is never used to sign you in.');
  });

  // Kinds of provider, which is what the law asks for, and not which companies
  // (the owner, 2026-10-03).
  it('says what kinds of provider receive information, without naming companies', () => {
    open('/privacy');
    expect(
      screen.getByText(
        /hosting, our database and sign-in, email delivery, text-message delivery, location lookup/,
      ),
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
    expect(section).toHaveTextContent(/opt-in data and consent are never shared with hosts/);
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

  it('names who runs the club, and no nonprofit', () => {
    open('/terms');
    expect(screen.getAllByText(/operated by\s+Alfred Shaheen/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Able Bodied|nonprofit/);
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

  // Apple 1.2 and Google Play's UGC policy.
  it('defines objectionable content, with zero tolerance and a 24-hour review', () => {
    open('/terms');
    const section = screen.getByRole('heading', { name: 'What is not allowed' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/Objectionable content is anything that/);
    expect(section).toHaveTextContent(/threatens, harasses, bullies/);
    expect(section).toHaveTextContent(
      'The club has zero tolerance for objectionable content and for abusive members.',
    );
    expect(
      screen.getByText('We review every report within 24 hours and act on it.'),
    ).toBeInTheDocument();
  });

  it('says how to report and how to block, and that content and membership can go', () => {
    open('/terms');
    const section = screen.getByRole('heading', { name: 'Reporting and blocking' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/To report a message, a post or a reply, press the •••/);
    expect(section).toHaveTextContent(/To block a member, press the •••/);
    expect(section).toHaveTextContent(/Me → Settings → Blocked members/);
    expect(screen.getByText(/We may remove anything that breaks these terms/)).toHaveTextContent(
      /pause a membership, or end it/,
    );
  });

  // Apple 1.4.1 and Google Play's health apps policy.
  it('says nothing in the club is medical advice, and to call 911 in an emergency', () => {
    open('/terms');
    const section = screen.getByRole('heading', { name: 'Not medical advice' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/nothing here is medical advice/);
    expect(section).toHaveTextContent(/check with your own doctor or care team/);
    expect(section).toHaveTextContent('In an emergency, call 911.');
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
    expect(s.getByRole('link', { name: 'hello@thesciclub.com' })).toHaveAttribute(
      'href',
      'mailto:hello@thesciclub.com',
    );
    expect(s.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});
