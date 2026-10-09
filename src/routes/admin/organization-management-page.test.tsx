import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import OrganizationManagementPage from '@/routes/admin/organization-management-page';

const db = vi.hoisted(() => ({ type: null as string | null }));
vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false }),
}));
vi.mock('@/lib/members', () => ({
  useOwnMember: () => ({
    member: db.type ? { id: 'me', type: db.type } : null,
    loading: false,
    error: null,
  }),
}));
vi.mock('@/lib/organization-representatives', () => ({
  useMyOrganizations: () => ({ ids: new Set(['org']), loading: false }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: [], loading: false, error: null, reload: vi.fn() }),
}));
beforeEach(() => {
  db.type = null;
});
function page() {
  return (
    <MemoryRouter initialEntries={['/organizations/manage']}>
      <Routes>
        <Route path="/organizations/manage" element={<OrganizationManagementPage />} />
        <Route path="/me" element={<p>Me screen</p>} />
      </Routes>
    </MemoryRouter>
  );
}
it('waits for the organization role before deciding access', () => {
  const { rerender } = render(page());
  expect(screen.getByText('Loading…')).toBeInTheDocument();
  expect(screen.queryByText('Me screen')).toBeNull();
  db.type = 'organization';
  rerender(page());
  expect(screen.getByRole('heading', { name: 'Organizations' })).toBeInTheDocument();
});
it('redirects an ordinary member after their role has loaded', () => {
  db.type = 'peer';
  render(page());
  expect(screen.getByText('Me screen')).toBeInTheDocument();
});
