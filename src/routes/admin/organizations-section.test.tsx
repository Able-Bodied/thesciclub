import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationsSection } from '@/routes/admin/organizations-section';
import type { Organization } from '@/types/domain';

const db = vi.hoisted(() => ({
  organizations: [] as Organization[],
  rpc: vi.fn(),
  reload: vi.fn(),
  failure: null as string | null,
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: db.organizations,
    loading: false,
    error: null,
    reload: db.reload,
  }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpc(name, args);
      if (db.failure) return Promise.resolve({ error: { message: db.failure } });
      if (name === 'admin_remove_organization')
        db.organizations = db.organizations.filter(
          (organization) => organization.id !== args.organization,
        );
      return Promise.resolve({ error: null });
    },
  }),
}));
const organization = (id = 'org'): Organization => ({
  id,
  name: `Organization ${id}`,
  shortCode: 'ORG',
  city: 'Test city',
  description: 'About the organization',
  tags: ['Support'],
  canInvite: true,
  logoPath: null,
});
beforeEach(() => {
  db.organizations = [organization(), organization('other')];
  db.rpc.mockClear();
  db.reload.mockClear();
  db.failure = null;
});
describe('organization management', () => {
  it('adds an organization through the protected RPC and refreshes the directory', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    await userEvent.type(screen.getByLabelText('Organization name'), 'New organization');
    await userEvent.type(screen.getByLabelText(/Short code/), 'new');
    await userEvent.type(screen.getByLabelText('City or region'), 'Test region');
    await userEvent.type(screen.getByLabelText(/Tags/), 'Events, Support');
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith(
        'save_organization',
        expect.objectContaining({
          organization: null,
          name: 'New organization',
          short_code: 'NEW',
          city: 'Test region',
          tags: ['Events', 'Support'],
          can_invite: true,
        }),
      );
    });
    expect(db.reload).toHaveBeenCalled();
  });
  it('edits the selected organization and preserves its identity', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.clear(screen.getByLabelText('Organization name'));
    await userEvent.type(screen.getByLabelText('Organization name'), 'Renamed organization');
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith(
        'save_organization',
        expect.objectContaining({ organization: 'org', name: 'Renamed organization' }),
      );
    });
  });
  it('requires a concrete remove confirmation, then refreshes links and directory', async () => {
    const changed = vi.fn();
    render(<OrganizationsSection onChange={changed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Organization org' }));
    expect(db.rpc).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove organization' }));
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith('admin_remove_organization', { organization: 'org' });
    });
    expect(changed).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Edit Organization org' })).toBeNull();
  });
  it('offers an organization account only its linked entries, without add/remove or vouching controls', async () => {
    render(<OrganizationsSection administrator={false} ids={new Set(['org'])} />);
    expect(screen.queryByText('Organization other')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add organization' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('retains the draft when the database refuses a changed role', async () => {
    db.failure = 'You cannot change this organization.';
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.type(screen.getByLabelText('Description'), ' Updated.');
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(db.failure);
    expect(screen.getByLabelText('Description')).toHaveValue('About the organization Updated.');
    expect(db.reload).not.toHaveBeenCalled();
  });
});
