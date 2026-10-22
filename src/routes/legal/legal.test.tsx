import { cleanup, render, screen, within } from '@testing-library/react';
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

  it('says up top who runs the club now and what changed', () => {
    open('/privacy');
    const note = screen.getByRole('heading', { name: /What changed on/ }).parentElement;
    if (!note) throw new Error('no note');
    expect(note).toHaveTextContent(
      /now operated by Alfred Shaheen, no longer by Able Bodied Inc\./,
    );
    expect(note).toHaveTextContent(/Removed: signing in by text message/);
  });

  // Phone sign-in went 2026-10-10; the text-message section went 2026-10-21.
  it('has no text-message sign-in', () => {
    open('/privacy');
    expect(screen.queryByRole('heading', { name: /Text messages/ })).toBeNull();
    const page = document.body.textContent;
    for (const gone of [/sign-in code/i, /code by text/, /Message and data rates/, /STOP/]) {
      expect(page).not.toMatch(gone);
    }
  });

  it('says it sells nothing, shows no ads and tracks nobody across apps', () => {
    open('/privacy');
    expect(
      screen.getByText(
        'We do not sell your information. There is no advertising in the club, and we do not track you across other apps or websites.',
      ),
    ).toBeInTheDocument();
  });

  it('says what the camera, photos and location are used for, and that OpenStreetMap gets a ZIP or position', () => {
    open('/privacy');
    const section = screen.getByRole('heading', {
      name: /camera, photos and location/,
    }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/only when you choose to add a photograph/);
    expect(section).toHaveTextContent(/only if you ask for it, while joining/);
    expect(section).toHaveTextContent(
      /send the ZIP code, or your device’s position, to OpenStreetMap/,
    );
    expect(section).toHaveTextContent(/Neither the ZIP code nor the position is kept/);
  });

  it('says links are fetched by the club, and YouTube hears of a video only on play', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Links and videos' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/the club’s own server visits that page once/);
    expect(section).toHaveTextContent(/your phone contacts nobody when you read it/);
    expect(section).toHaveTextContent(/YouTube receives anything only when you press play/);
  });

  it('names Apple and Google as notification services', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Notifications' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/Apple’s on an iPhone/);
    expect(section).toHaveTextContent(/Google’s on Android/);
  });

  // The owner, 2026-10-16 and 2026-10-20: Stats may name members.
  it('says what administrators see, Stats included', () => {
    open('/privacy');
    const section = screen.getByRole('heading', {
      name: 'What administrators can see',
    }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/blocks: who blocked whom/);
    expect(section).toHaveTextContent(/who has read each post and when/);
    expect(section).toHaveTextContent(/on a phone or\s+tablet, or a computer/);
  });

  // Google Play requires a way to ask for deletion without the app.
  it('says how to delete an account in the app and by email, and how long things are kept', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Deleting your account' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/Me → Account → Delete my account/);
    expect(section).toHaveTextContent(/email hello@thesciclub\.com to ask us to delete/);
    const kept = screen.getByRole('heading', { name: 'How long we keep it' }).parentElement;
    if (!kept) throw new Error('no section');
    expect(kept).toHaveTextContent(/after 90 days/);
    expect(kept).toHaveTextContent(/Your notifications list: 30 days/);
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

  it('says a phone number is optional, for event hosts, and never signs anybody in', () => {
    open('/privacy');
    const item = screen.getByText(/A phone number, only if you add one/).closest('li');
    expect(item).toHaveTextContent(/It is never used to sign you in\./);
  });

  // Kinds of infrastructure provider, not which companies (the owner,
  // 2026-10-03); the ones a member meets in the app are named.
  it('says what kinds of provider receive information, naming only those a member meets', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Service providers' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/hosting, our database, file storage and sign-in/);
    expect(section).toHaveTextContent(/location lookup \(OpenStreetMap\)/);
    const page = document.body.textContent;
    for (const company of ['Supabase', 'Twilio', 'Netlify', 'Resend', 'GitHub']) {
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

  // The owner, 2026-10-22: joining offers Relative/Spouse.
  it('says the club is for family members too, on both pages', () => {
    for (const path of ['/privacy', '/terms']) {
      open(path);
      expect(document.body.textContent).toMatch(
        /adults living with spinal cord\s+injury and their family members/,
      );
      cleanup();
    }
  });

  // The owner, 2026-10-22: the club lists grants and helps with none.
  it('says the club lists grants, shares nothing with grant-makers, and helps with no application', () => {
    open('/privacy');
    const section = screen.getByRole('heading', { name: 'Grants' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/We do not help with applications/);
    expect(section).toHaveTextContent(/we share nothing about you with grant-makers/);
    expect(document.body.textContent).not.toMatch(/If you ask us to help/);
  });

  // 20261022100000 and supabase/tests/sign-in-log-forgotten.sql.
  it('says deleting erases sign-in records, and invites last until used or withdrawn', () => {
    open('/privacy');
    const deleting = screen.getByRole('heading', { name: 'Deleting your account' }).parentElement;
    const kept = screen.getByRole('heading', { name: 'How long we keep it' }).parentElement;
    if (!deleting || !kept) throw new Error('no section');
    expect(deleting).toHaveTextContent(/your\s+sign-in records with their email and IP addresses/);
    expect(kept).toHaveTextContent(/invites do not expire/);
    expect(kept).toHaveTextContent(/withdrawn by whoever sent it or an administrator/);
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

// Google Play: a public page, naming the app, that asks for deletion without it.
describe('Deleting your account', () => {
  it('opens with no account and names the app', () => {
    open('/delete-account');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Deleting your account' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Join' })).toBeNull();
    expect(screen.getByText(/in The SCI Club, and what that erases/)).toBeInTheDocument();
  });

  it('gives the steps in the app', () => {
    open('/delete-account');
    const section = screen.getByRole('heading', { name: 'In the app' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/Go to Me, then the Account tab/);
    expect(section).toHaveTextContent(/Press Delete my account/);
  });

  it('gives an email route for somebody who cannot sign in', () => {
    open('/delete-account');
    const section = screen.getByRole('heading', { name: 'By email' }).parentElement;
    if (!section) throw new Error('no section');
    expect(section).toHaveTextContent(/If you cannot sign in, or no longer have the app/);
    expect(within(section).getByRole('link', { name: 'hello@thesciclub.com' })).toHaveAttribute(
      'href',
      'mailto:hello@thesciclub.com?subject=Delete%20my%20account',
    );
  });

  it('says what is erased and what stays', () => {
    open('/delete-account');
    const erased = screen.getByRole('heading', { name: 'What is erased' }).parentElement;
    const stays = screen.getByRole('heading', { name: 'What stays' }).parentElement;
    if (!erased || !stays) throw new Error('no section');
    expect(erased).toHaveTextContent(/email address, phone number, photograph and birthday/);
    expect(erased).toHaveTextContent(/Your sign-in records, with the email and IP addresses/);
    expect(stays).toHaveTextContent(/“Deleted member” instead of your name/);
  });

  it('is linked from the Privacy Policy and the Terms', () => {
    for (const path of ['/privacy', '/terms']) {
      open(path);
      expect(screen.getByRole('link', { name: 'Deleting your account' })).toHaveAttribute(
        'href',
        '/delete-account',
      );
      cleanup();
    }
  });
});
