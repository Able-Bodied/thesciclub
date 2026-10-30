import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationReviews } from '@/routes/events/organization-reviews';

const api = vi.hoisted(() => ({ rows: [] as unknown[], calls: [] as [string, unknown][] }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      api.calls.push([name, args]);
      return Promise.resolve({
        data: name === 'organization_member_reviews' ? api.rows : null,
        error: null,
      });
    },
  }),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const row = (extra: object) => ({
  member_id: 'm1',
  display_name: 'Maya Ruiz',
  username: 'maya',
  photo_path: null,
  photo_alt: null,
  joined_at: '2026-10-30T00:00:00Z',
  denied_at: null,
  denied_reason: null,
  ...extra,
});

function renderIt() {
  render(
    <MemoryRouter>
      <OrganizationReviews organizationId="o1" onChanged={() => undefined} />
    </MemoryRouter>,
  );
}

describe('reviewing who pressed Join', () => {
  beforeEach(() => {
    api.rows = [row({})];
    api.calls = [];
  });

  it('approves', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Approve Maya Ruiz' }));
    expect(api.calls).toContainEqual([
      'review_organization_member',
      { p_organization: 'o1', p_member: 'm1', p_approve: true, p_reason: null },
    ]);
  });

  // The owner: an org admin "can deny a membership and explain why".
  it('asks why before denying, and sends the reason', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Deny Maya Ruiz' }));
    const send = screen.getByRole('button', { name: 'Deny and send' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Why\?/), 'For staff only');
    await userEvent.click(send);
    expect(api.calls).toContainEqual([
      'review_organization_member',
      { p_organization: 'o1', p_member: 'm1', p_approve: false, p_reason: 'For staff only' },
    ]);
  });

  it('keeps a denial listed, with the way to take it back', async () => {
    api.rows = [row({ denied_at: '2026-10-30T01:00:00Z', denied_reason: 'For staff only' })];
    renderIt();
    expect(await screen.findByText('For staff only')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Let Maya Ruiz back in' }));
    expect(api.calls).toContainEqual([
      'review_organization_member',
      { p_organization: 'o1', p_member: 'm1', p_approve: true, p_reason: null },
    ]);
  });

  it('draws nothing with nobody to review', async () => {
    api.rows = [];
    renderIt();
    await Promise.resolve();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
