import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Organization } from '@/types/domain';

const orgs = vi.hoisted(() => ({ list: [] as Organization[] }));
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
    render(<BlockedScreen onTryAnother={noop} />);
    const logo = document.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toContain('organizations/ncs.webp');
  });

  it('falls back to the short code when there is no logo', () => {
    orgs.list = [organization({ logoPath: null })];
    render(<BlockedScreen onTryAnother={noop} />);
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
    render(<BlockedScreen onTryAnother={noop} />);
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Wheel with Me')).toBeNull();
  });
});
