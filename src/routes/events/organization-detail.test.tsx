import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as Grants from '@/lib/grants';
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
const grants = vi.hoisted(() => ({ list: [] as Grants.Grant[] }));
vi.mock('@/lib/grants', async (importOriginal) => ({
  ...(await importOriginal<typeof Grants>()),
  useOrganizationGrants: () => ({ grants: grants.list, loading: false, error: null }),
}));

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

describe('an organization’s grants', () => {
  const page = () =>
    render(
      <MemoryRouter initialEntries={['/events/organizations/nt']}>
        <Routes>
          <Route path="/events/organizations/:id" element={<OrganizationDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('calls out one that is open, and says following brings a notification', () => {
    // A window from last year to next year is open on whatever day this runs.
    const year = new Date().getFullYear();
    grants.list = [
      {
        id: 'g1',
        name: 'Active Fund',
        url: 'https://example.org/fund',
        summary: 'Pays for adaptive equipment.',
        applyAnyTime: false,
        windows: [{ opensOn: `${year - 1}-01-01`, closesOn: `${year + 1}-12-31`, yearly: false }],
      },
    ];
    page();
    expect(screen.getByRole('link', { name: 'Active Fund' })).toHaveAttribute(
      'href',
      'https://example.org/fund',
    );
    expect(screen.getByText(/Applications are open now, until/)).toBeInTheDocument();
    expect(
      screen.getByText('Follow NatureTrack and we’ll notify you when applications open.'),
    ).toBeInTheDocument();
  });

  it('says apply any time, and promises nothing, when a grant has no dates', () => {
    grants.list = [
      {
        id: 'g2',
        name: 'Help Fund',
        url: 'https://example.org/help',
        summary: '',
        applyAnyTime: true,
        windows: [],
      },
    ];
    page();
    expect(screen.getByText('Apply any time.')).toBeInTheDocument();
    expect(screen.queryByText(/we’ll notify you/)).toBeNull();
  });
});
