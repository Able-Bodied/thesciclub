import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationJoinSetting } from '@/routes/events/organization-join-setting';
import { OrganizationMemberRemove } from '@/routes/events/organization-member-remove';

const api = vi.hoisted(() => ({
  calls: [] as [string, unknown][],
  error: null as { message: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      api.calls.push([name, args]);
      return Promise.resolve({ data: null, error: api.error });
    },
  }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ reload: () => undefined }),
}));

beforeEach(() => {
  api.calls = [];
  api.error = null;
});

describe('how people join an organization', () => {
  it('starts open, and saves approving first', async () => {
    const onChanged = vi.fn();
    render(<OrganizationJoinSetting organizationId="o1" needed={false} onChanged={onChanged} />);
    const toggle = screen.getByRole('switch', { name: 'Approve new members' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Open to all/)).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(api.calls).toContainEqual([
      'set_organization_joins_need_approval',
      { p_organization: 'o1', p_needed: true },
    ]);
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('goes back and says so when it is refused', async () => {
    api.error = { message: 'no' };
    render(<OrganizationJoinSetting organizationId="o1" needed onChanged={() => undefined} />);
    const toggle = screen.getByRole('switch', { name: 'Approve new members' });
    await userEvent.click(toggle);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

describe('removing a member', () => {
  const member = {
    id: 'm1',
    displayName: 'Maya Ruiz',
    username: 'maya',
    photoPath: null,
    photoAlt: null,
    joinedVia: 'join' as const,
    joinedAt: '2026-10-30T00:00:00Z',
  };

  it('asks why, and sends it as a denial', async () => {
    const onRemoved = vi.fn();
    render(<OrganizationMemberRemove organizationId="o1" member={member} onRemoved={onRemoved} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Maya Ruiz' }));
    const send = screen.getByRole('button', { name: 'Remove and send' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Maya Ruiz will read this/), 'Not local');
    await userEvent.click(send);
    expect(api.calls).toContainEqual([
      'review_organization_member',
      { p_organization: 'o1', p_member: 'm1', p_approve: false, p_reason: 'Not local' },
    ]);
    await waitFor(() => {
      expect(onRemoved).toHaveBeenCalled();
    });
  });
});
