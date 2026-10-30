import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteToOrganization } from '@/routes/peers/invite-to-organization';

const api = vi.hoisted(() => ({
  calls: [] as unknown[],
  error: null as { message: string } | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'me' }) }));
vi.mock('@/lib/organization-representatives', () => ({
  useMyOrganizations: () => ({ ids: new Set(['o1', 'o2']), loading: false }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    byId: new Map([
      ['o1', { id: 'o1', name: 'NorCal SCI' }],
      ['o2', { id: 'o2', name: 'Ride On' }],
    ]),
  }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      api.calls.push([name, args]);
      return Promise.resolve({ data: null, error: api.error });
    },
  }),
}));

describe('inviting a member to an organization', () => {
  beforeEach(() => {
    api.calls = [];
    api.error = null;
  });

  it('offers only the organizations they are not in, and sends once', async () => {
    render(<InviteToOrganization memberId="m1" name="Maya" memberOf={['o2']} />);
    expect(screen.queryByRole('button', { name: /Ride On/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Invite Maya to join NorCal SCI' }));
    expect(api.calls).toEqual([
      ['invite_to_organization', { p_organization: 'o1', p_member: 'm1' }],
    ]);
    expect(await screen.findByRole('button', { name: 'Invited to NorCal SCI' })).toBeDisabled();
  });

  it('says so when the club refuses', async () => {
    api.error = { message: 'They have been invited to it already.' };
    render(<InviteToOrganization memberId="m1" name="Maya" memberOf={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Invite Maya to join NorCal SCI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already');
  });

  it('is not offered on your own profile', () => {
    render(<InviteToOrganization memberId="me" name="Me" memberOf={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
