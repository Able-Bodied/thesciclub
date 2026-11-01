import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationEditor } from '@/routes/admin/organization-editor';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpc(name, args);
      return Promise.resolve({ data: 'made', error: null });
    },
  }),
}));

beforeEach(() => {
  rpc.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

async function fillIn() {
  await userEvent.type(screen.getByLabelText('Organization name'), 'Rolling Hikers');
  await userEvent.type(screen.getByLabelText(/^Short code/), 'rh');
  await userEvent.selectOptions(screen.getByLabelText(/^Type/), 'outdoor');
}

describe('adding an organization', () => {
  it('sends a member’s to the administrators, with no logo or vouching to set', async () => {
    const saved = vi.fn();
    render(
      <OrganizationEditor
        organization={null}
        administrator={false}
        onSaved={saved}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/An administrator checks it/)).toBeInTheDocument();
    expect(screen.queryByText('Choose a logo')).not.toBeVisible();
    expect(screen.queryByLabelText('Can vouch for members')).toBeNull();
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => {
      expect(saved).toHaveBeenCalled();
    });
    expect(rpc).toHaveBeenCalledWith(
      'request_organization',
      expect.objectContaining({
        p_draft: expect.objectContaining({ name: 'Rolling Hikers', shortCode: 'RH' }) as unknown,
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith('save_organization', expect.anything());
  });

  it('saves an administrator’s straight away', async () => {
    const saved = vi.fn();
    render(
      <OrganizationEditor organization={null} administrator onSaved={saved} onCancel={vi.fn()} />,
    );
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(saved).toHaveBeenCalled();
    });
    expect(rpc).toHaveBeenCalledWith('save_organization', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('request_organization', expect.anything());
  });
});
