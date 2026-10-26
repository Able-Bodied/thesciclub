import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Organization } from '@/types/domain';

const orgs = vi.hoisted(() => ({ list: [] as Organization[] }));
// The logo is drawn through a signed URL since HANDOFF.md "What Home is" step 6. Stubbed
// here, as every screen test stubs the hooks its screen calls: unstubbed, the
// signing request is refused by the network guard, storage-js turns that into
// an ordinary error, and the badge quietly draws its short code instead.
vi.mock('@/lib/photos', () => ({
  usePhotoUrl: (path: string | null | undefined) => (path ? `https://signed.test/${path}` : null),
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: orgs.list, loading: false }),
}));

const { BlockedScreen } = await import('@/routes/onboarding/blocked');

const noop = vi.fn();

const organization = (o: Partial<Organization> = {}): Organization =>
  ({
    id: 'o1',
    shortCode: 'NCS',
    name: 'NorCal SCI',
    city: 'Northern California',
    description: 'The peer mentor programme every member of this club came in through.',
    tags: [],
    canInvite: true,
    logoPath: 'organizations/ncs.webp',
    aliases: [],
    ...o,
  }) as Organization;

describe('the screen somebody is turned away on', () => {
  // It had its own hand-rolled gold tile that could only ever show initials,
  // while every events screen showed the real logo. This is the screen where
  // recognising who to contact matters most.
  it('shows an organization’s logo, not just its initials', () => {
    orgs.list = [organization()];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    const logo = document.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('https://signed.test/organizations/ncs.webp');
  });

  it('falls back to the short code when there is no logo', () => {
    orgs.list = [organization({ logoPath: null })];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('NCS')).toBeInTheDocument();
  });

  // Only the organizations who can actually add a number. Naming one that
  // cannot sends a newly injured person to the wrong place at the worst
  // possible moment — see the file header.
  it('lists only organizations that can invite', () => {
    orgs.list = [
      organization(),
      organization({ id: 'o2', shortCode: 'WWM', name: 'Wheel with Me', canInvite: false }),
    ];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Wheel with Me')).toBeNull();
  });

  // The owner, 2026-10-11: the name and the place are enough here.
  it('names each organization and its place, without its description', () => {
    orgs.list = [organization()];
    render(<BlockedScreen onTryAnother={noop} email="dana@example.com" />);
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.getByText('Northern California')).toBeInTheDocument();
    expect(screen.queryByText(/peer mentor programme every member/)).toBeNull();
  });
});

describe('the way out', () => {
  it('names the address that was refused', () => {
    orgs.list = [];
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
