import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeOrganization } from '@/test/factory';
import type { RepresentedOrganization } from '@/types/domain';

const state = vi.hoisted(() => ({
  mine: new Set<string>(),
  grant: vi.fn(),
  revoke: vi.fn(),
  announce: vi.fn(),
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));
vi.mock('@/lib/organization-representatives', () => ({
  useMyOrganizations: () => ({ ids: state.mine, loading: false }),
}));
vi.mock('@/lib/organizations', () => {
  const ncs = makeOrganization({ id: 'ncs', name: 'NorCal SCI', shortCode: 'NCS' });
  return {
    useOrganizations: () => ({
      organizations: [ncs],
      byId: new Map([['ncs', ncs]]),
      loading: false,
      error: null,
      reload: () => undefined,
    }),
  };
});
vi.mock('@/lib/organization-mentors', () => ({
  grantMentor: (...args: unknown[]) => state.grant(...args) as Promise<{ ok: boolean }>,
  revokeMentor: (...args: unknown[]) => state.revoke(...args) as Promise<{ ok: boolean }>,
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => state.announce }));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { mentorActionLabel, useMentorActions } = await import('@/routes/peers/mentor-controls');

/** The ••• lines as the profile draws them, and the error under them. */
function Harness(props: {
  memberId: string;
  mentorOf: RepresentedOrganization[];
  onChange: (next: RepresentedOrganization[]) => void;
}) {
  const { actions, run, error } = useMentorActions({ ...props, displayName: 'Nicole' });
  return (
    <>
      {actions.map((action) => (
        <button
          key={action.organization.id}
          type="button"
          onClick={() => {
            run(action);
          }}
        >
          {mentorActionLabel(action)}
        </button>
      ))}
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

const NCS: RepresentedOrganization = {
  id: 'ncs',
  name: 'NorCal SCI',
  shortCode: 'NCS',
  logoPath: null,
};

function renderIt(mentorOf: RepresentedOrganization[] = [], memberId = 'nicole') {
  const onChange = vi.fn();
  render(<Harness memberId={memberId} mentorOf={mentorOf} onChange={onChange} />);
  return onChange;
}

beforeEach(() => {
  state.mine = new Set(['ncs']);
  state.grant.mockReset().mockResolvedValue({ ok: true });
  state.revoke.mockReset().mockResolvedValue({ ok: true });
  state.announce.mockReset();
});

// The owner, 2026-10-28: an organization's admins make its mentors.
describe('making a mentor from a profile', () => {
  it('lets an org admin make a member a mentor of their organization', async () => {
    const onChange = renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Make mentor for NorCal SCI' }));
    expect(state.grant).toHaveBeenCalledWith('ncs', 'nicole');
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([NCS]);
    });
    expect(state.announce).toHaveBeenCalledWith('Nicole is now a mentor of NorCal SCI.');
  });

  it('removes them as its mentor', async () => {
    const onChange = renderIt([NCS]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove as mentor for NorCal SCI' }));
    expect(state.revoke).toHaveBeenCalledWith('ncs', 'nicole');
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  it('says so when the database refuses', async () => {
    state.grant.mockResolvedValue({
      ok: false,
      error: 'Only that organization’s admins can make its mentors.',
    });
    const onChange = renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Make mentor for NorCal SCI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only that organization');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows nothing to a member who is no org admin', () => {
    state.mine = new Set();
    renderIt();
    expect(screen.queryByRole('button', { name: /mentor/ })).not.toBeInTheDocument();
  });

  it('shows nothing on their own profile', () => {
    renderIt([], 'me');
    expect(screen.queryByRole('button', { name: /mentor/ })).not.toBeInTheDocument();
  });
});
