import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as Grants from '@/lib/grants';
import { makeEvent, makeOrganization } from '@/test/factory';

const organization = makeOrganization({
  id: 'nt',
  name: 'NatureTrack',
  description:
    'Lends Freedom Trax for free.\nBorrow a Freedom Trax: https://naturetrack.org/borrow-a-freedom-trax/',
});

const formatted = makeOrganization({
  id: 'md',
  name: 'Sailing Club',
  description:
    'Sailing for everybody.\n\n- **Lessons**: on the bay\n- Races\n\n[sail.org](https://sail.org/)',
});

// Every read stubbed: `.env.local` points at the hosted project.
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    byId: new Map([
      ['nt', organization],
      ['md', formatted],
    ]),
    loading: false,
  }),
}));
vi.mock('@/routes/reviews/reviews-section', () => ({ ReviewsSection: () => null }));
vi.mock('@/lib/organization-follows', () => ({
  useOrganizationFollows: () => ({
    following: new Set(),
    requested: new Set(),
    toggle: () => undefined,
  }),
}));
const calendar = vi.hoisted(() => ({ events: [] as unknown[] }));

vi.mock('@/lib/events', () => ({
  useEvents: () => ({ events: calendar.events, loading: false, error: null }),
}));
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

  // The owner, 2026-10-20: richer text, in the small Markdown events use.
  it('draws its bold, its list and its link', () => {
    render(
      <MemoryRouter initialEntries={['/events/organizations/md']}>
        <Routes>
          <Route path="/events/organizations/:id" element={<OrganizationDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Lessons: on the bay',
      'Races',
    ]);
    expect(screen.getByText('Lessons').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'sail.org' })).toHaveAttribute(
      'href',
      'https://sail.org/',
    );
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });
});

const renderOrganization = () =>
  render(
    <MemoryRouter initialEntries={['/events/organizations/nt']}>
      <Routes>
        <Route path="/events/organizations/:id" element={<OrganizationDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('its upcoming events', () => {
  const ahead = (i: number) =>
    makeEvent({
      id: `e${i}`,
      title: `Event ${i}`,
      organizationId: 'nt',
      startTime: new Date(Date.now() + (i + 1) * 86_400_000).toISOString(),
    });

  it('shows the next five, and the rest on asking', async () => {
    calendar.events = Array.from({ length: 8 }, (_, i) => ahead(i));
    renderOrganization();
    expect(await screen.findByText('Event 4')).toBeInTheDocument();
    expect(screen.queryByText('Event 5')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '3 more' }));
    expect(screen.getByText('Event 7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
    calendar.events = [];
  });

  it('offers nothing more with five or fewer', async () => {
    calendar.events = Array.from({ length: 5 }, (_, i) => ahead(i));
    renderOrganization();
    expect(await screen.findByText('Event 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
    calendar.events = [];
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
      screen.getByText('Join NatureTrack and we’ll notify you when applications open.'),
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
