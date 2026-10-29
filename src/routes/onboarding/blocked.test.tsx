import { render as renderBare, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { InviteRequestChoice } from '@/lib/invite-requests';

const orgs = vi.hoisted(() => ({ list: [] as InviteRequestChoice[] }));
// The logo is drawn through a signed URL since HANDOFF.md "What Home is" step 6. Stubbed
// here, as every screen test stubs the hooks its screen calls: unstubbed, the
// signing request is refused by the network guard, storage-js turns that into
// an ordinary error, and the badge quietly draws its short code instead.
vi.mock('@/lib/photos', () => ({
  usePhotoUrl: (path: string | null | undefined) => (path ? `https://signed.test/${path}` : null),
}));

// invite_request_choices() decides which organizations can invite
// (20261029010000); the screen only shows its answer.
vi.mock('@/lib/invite-requests', () => ({
  fetchInviteRequestChoices: () => Promise.resolve({ ok: true, value: orgs.list }),
}));

const { BlockedScreen } = await import('@/routes/onboarding/blocked');

function Picked() {
  const location = useLocation();
  return <p>picked {JSON.stringify(location.state)}</p>;
}

function render(screenToShow: ReactElement) {
  return renderBare(
    <MemoryRouter initialEntries={['/join']}>
      <Routes>
        <Route path="/join" element={screenToShow} />
        <Route path="/request-invite" element={<Picked />} />
      </Routes>
    </MemoryRouter>,
  );
}

const noop = vi.fn();

const organization = (o: Partial<InviteRequestChoice> = {}): InviteRequestChoice => ({
  organizationId: 'o1',
  shortCode: 'NCS',
  name: 'NorCal SCI',
  logoPath: 'organizations/ncs.webp',
  admins: [{ id: 'a1', firstName: 'Sam' }],
  ...o,
});

describe('the screen somebody is turned away on', () => {
  // It had its own hand-rolled gold tile that could only ever show initials,
  // while every events screen showed the real logo. This is the screen where
  // recognising who to contact matters most.
  it('shows an organization’s logo, not just its initials', async () => {
    orgs.list = [organization()];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    await screen.findByText('NorCal SCI');
    const logo = document.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('https://signed.test/organizations/ncs.webp');
  });

  it('falls back to the short code when there is no logo', async () => {
    orgs.list = [organization({ logoPath: null })];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(await screen.findByText('NCS')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  // The owner, 2026-10-28: highlight that joining is by invitation only, and
  // list the org admins next to each organization to ask.
  it('says joining is by invitation only, with a link to request one', async () => {
    orgs.list = [organization()];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(screen.getByText('Joining is by invitation only.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'request one' })).toHaveAttribute(
      'href',
      '/request-invite',
    );
    expect(await screen.findByText(/Tap a name to request an invite/)).toBeInTheDocument();
  });

  it('lists each org admin by first name, and a tap opens the request with them chosen', async () => {
    orgs.list = [
      organization({
        admins: [
          { id: 'a1', firstName: 'Sam' },
          { id: 'a2', firstName: 'Alfred' },
        ],
      }),
    ];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ask Alfred from NorCal SCI' }),
    );
    expect(
      await screen.findByText('picked {"picked":{"organizationId":"o1","adminId":"a2"}}'),
    ).toBeInTheDocument();
  });

  it('shows no list when nobody can be asked', async () => {
    orgs.list = [];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    await waitFor(() => {
      expect(screen.queryByText(/Tap a name/)).toBeNull();
    });
  });
});

describe('the way out', () => {
  it('names the address that was refused', () => {
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(screen.getByText('dana@example.com')).toBeInTheDocument();
    expect(screen.getByText(/isn't on the list/)).toBeInTheDocument();
  });

  it('says what to try when the email may be the wrong one', () => {
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(screen.getByText(/You may have joined with another email/)).toBeInTheDocument();
  });

  // Nothing that looks through a phone's contacts (the owner, 2026-10-10), and
  // no consultation call for now (2026-10-25).
  it('offers no consultation call and no “ask somebody you know”', () => {
    render(<BlockedScreen onTryAnother={noop} email={null} />);
    expect(screen.queryByRole('link', { name: /Book a call/ })).toBeNull();
    expect(screen.queryByText(/Ask somebody/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /contacts/i })).toBeNull();
    expect(screen.queryByLabelText(/number of somebody/i)).toBeNull();
  });

  it('signs out to try another email', async () => {
    const onTryAnother = vi.fn();
    render(<BlockedScreen onTryAnother={onTryAnother} email="dana@example.com" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out and try another email' }));
    expect(onTryAnother).toHaveBeenCalledOnce();
  });

  // Refused at the join form (20261012040000): there is no account yet.
  it('refused at sign-up: no signing out, and points at the invited address or the link', async () => {
    const onTryAnother = vi.fn();
    render(<BlockedScreen onTryAnother={onTryAnother} email="dana@example.com" signedIn={false} />);
    expect(screen.queryByText(/You may have joined with another email/)).toBeNull();
    expect(screen.getByText(/use the address your invitation was sent to/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try another email' }));
    expect(onTryAnother).toHaveBeenCalledOnce();
  });
});
