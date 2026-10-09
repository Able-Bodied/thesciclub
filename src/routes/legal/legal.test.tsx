import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/**
 * The Privacy Policy and the Terms of Service, through the real routes and
 * signed out: the carriers' reviewers have no account, and neither does
 * somebody reading them from the phone step.
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

  // The sentence the carriers look for, word for word.
  it('says SMS opt-in data is not sold or shared for marketing', () => {
    open('/privacy');
    expect(
      screen.getByText(
        'We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.',
      ),
    ).toBeInTheDocument();
  });

  // The wording Twilio's rejection (error 30908, 2026-10-02) said was missing.
  it('says mobile information and consent go to no third party or affiliate', () => {
    open('/privacy');
    // The error documentation's own "passing" sentence, word for word.
    expect(
      screen.getByText(
        'We do not share, sell, or provide your mobile phone number or messaging consent data to third parties or affiliates for marketing or promotional purposes.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging opt-in data and consent will not be shared with any third parties.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/excludes your text messaging opt-in data and consent/),
    ).toBeInTheDocument();
  });

  // Required in the policy itself when the opt-in is a web form (error 30908).
  it('gives the message frequency and the rates line', () => {
    open('/privacy');
    expect(screen.getByText(/one text each time you ask for a sign-in code/)).toBeInTheDocument();
    expect(screen.getByText('Message and data rates may apply.').tagName).toBe('B');
  });

  // Kinds of provider, which is what the law asks for, and not which companies
  // (the owner, 2026-10-03).
  it('says what kinds of provider receive information, without naming companies', () => {
    open('/privacy');
    expect(
      screen.getByText(/hosting, our database and sign-in, text messages, location lookup/),
    ).toBeInTheDocument();
    const page = document.body.textContent;
    for (const company of ['Supabase', 'Twilio', 'Netlify', 'OpenStreetMap']) {
      expect(page).not.toContain(company);
    }
  });

  // The owner, 2026-10-08: an event's host receives the phone numbers of the
  // members going. The policy has to say so, plainly, and never for marketing.
  it('says an event host receives the number of a member going, and only for that', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Event hosts' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/receives your phone number, for that event only/);
    expect(section).toHaveTextContent(/Choosing Interested shares nothing/);
    expect(section).toHaveTextContent(/not to use your number for marketing/);
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

  // What carriers ask of SMS terms, HELP and STOP in bold among it.
  it('carries the text-message terms', () => {
    open('/terms');
    const section = screen.getByRole('heading', { name: 'Text messages' }).parentElement;
    if (!section) throw new Error('no section');
    const s = within(section);
    expect(s.getByText('The SCI Club sign-in codes.').tagName).toBe('B');
    expect(s.getByText(/one message each time you ask for a code/)).toBeInTheDocument();
    expect(s.getByText('Message and data rates may apply.').tagName).toBe('B');
    expect(s.getByText('Text HELP').tagName).toBe('B');
    expect(s.getByText('Text STOP').tagName).toBe('B');
    expect(
      s.getByText(/Carriers are not liable for delayed or undelivered messages/),
    ).toBeInTheDocument();
    expect(s.getByRole('link', { name: 'info@ablebodied.org' })).toHaveAttribute(
      'href',
      'mailto:info@ablebodied.org',
    );
    expect(s.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});
