import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as InviteRequest from '@/lib/invite-request';
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

// The lookup is the network; stubbed, recording what it was asked.
const lookup = vi.hoisted(() => ({
  asked: [] as string[][],
  answer: [] as string[],
  failure: null as string | null,
  contacts: null as { name: string; numbers: string[] }[] | null,
}));
vi.mock('@/lib/invite-request', async (importOriginal) => ({
  ...(await importOriginal<typeof InviteRequest>()),
  findInviters: (numbers: string[]) => {
    lookup.asked.push(numbers);
    return Promise.resolve(
      lookup.failure ? { ok: false, error: lookup.failure } : { ok: true, phones: lookup.answer },
    );
  },
  canPickContacts: () => lookup.contacts !== null,
  pickContacts: () => Promise.resolve(lookup.contacts ?? []),
}));

beforeEach(() => {
  lookup.asked = [];
  lookup.answer = [];
  lookup.failure = null;
  lookup.contacts = null;
});

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
    render(<BlockedScreen onTryAnother={noop} phone="(408) 555-0199" />);
    const logo = document.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('https://signed.test/organizations/ncs.webp');
  });

  it('falls back to the short code when there is no logo', () => {
    orgs.list = [organization({ logoPath: null })];
    render(<BlockedScreen onTryAnother={noop} phone="(408) 555-0199" />);
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
    render(<BlockedScreen onTryAnother={noop} phone="(408) 555-0199" />);
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Wheel with Me')).toBeNull();
  });
});

describe('asking somebody you know', () => {
  it('checks a typed number, and offers a text that asks for the right number', async () => {
    const user = userEvent.setup();
    lookup.answer = ['14085550111'];
    render(<BlockedScreen onTryAnother={noop} phone="(408) 555-0199" />);
    expect(screen.queryByRole('button', { name: /Choose from your contacts/ })).toBeNull();
    await user.type(screen.getByLabelText('The number of somebody you know'), '4085550111');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(lookup.asked).toEqual([['(408) 555-0111']]);
    const text = await screen.findByRole('link', { name: 'Text (408) 555-0111' });
    const href = text.getAttribute('href') ?? '';
    expect(href.startsWith('sms:+14085550111?&body=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('Could you add (408) 555-0199?');
  });

  it('checks the contacts chosen, by their own names, once each', async () => {
    const user = userEvent.setup();
    lookup.contacts = [
      { name: 'Dana', numbers: ['+1 (408) 555-0111', '408-555-0111'] },
      { name: 'Lee', numbers: ['4085550122'] },
    ];
    lookup.answer = ['14085550111'];
    render(<BlockedScreen onTryAnother={noop} phone="(408) 555-0199" />);
    await user.click(screen.getByRole('button', { name: /Choose from your contacts/ }));
    expect(lookup.asked).toEqual([['+1 (408) 555-0111', '408-555-0111', '4085550122']]);
    expect(await screen.findAllByRole('link', { name: 'Text Dana' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Text Lee' })).toBeNull();
  });

  it('says so when nobody matches, and the call is always offered', async () => {
    const user = userEvent.setup();
    render(<BlockedScreen onTryAnother={noop} phone="(408) 555-0199" />);
    const call = screen.getByRole('link', { name: 'Book a call with Wojtek' });
    expect(call.getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com\//);
    expect(call).toHaveAttribute('target', '_blank');
    await user.type(screen.getByLabelText('The number of somebody you know'), '4085550111');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText(/None of them can add you/)).toBeInTheDocument();
  });

  it('shows the database’s sentence when it refuses', async () => {
    const user = userEvent.setup();
    lookup.failure =
      'You have looked five times today. Try again tomorrow, or book a call instead.';
    render(<BlockedScreen onTryAnother={noop} phone="(408) 555-0199" />);
    await user.type(screen.getByLabelText('The number of somebody you know'), '4085550111');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('five times today');
    });
  });
});
