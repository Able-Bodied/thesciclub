import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { makeOrganization } from '@/test/factory';

const organization = makeOrganization({
  id: 'nt',
  name: 'NatureTrack',
  description:
    'Lends Freedom Trax for free.\nBorrow a Freedom Trax: https://naturetrack.org/borrow-a-freedom-trax/',
});

// Every read stubbed: `.env.local` points at the hosted project.
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ byId: new Map([['nt', organization]]), loading: false }),
}));
vi.mock('@/lib/organization-follows', () => ({
  useOrganizationFollows: () => ({ following: new Set(), toggle: () => undefined }),
}));
vi.mock('@/lib/events', () => ({ useEvents: () => ({ events: [], loading: false, error: null }) }));
vi.mock('@/lib/members', () => ({ useBrowseMembers: () => ({ members: [], loading: false }) }));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { default: OrganizationDetailPage } = await import('@/routes/events/organization-detail');

describe('an organization’s description', () => {
  it('turns its web addresses into links that open outside the app', () => {
    render(
      <MemoryRouter initialEntries={['/events/organizations/nt']}>
        <Routes>
          <Route path="/events/organizations/:id" element={<OrganizationDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /naturetrack\.org/ });
    expect(link).toHaveAttribute('href', 'https://naturetrack.org/borrow-a-freedom-trax/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Lends Freedom Trax for free\./)).toBeInTheDocument();
  });
});
