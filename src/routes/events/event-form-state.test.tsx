import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { makeOrganization } from '@/test/factory';

const organizations = [
  makeOrganization({ id: 'borp', name: 'BORP', city: 'Berkeley', state: 'CA' }),
  makeOrganization({ id: 'hf', name: 'High Fives', city: 'Truckee', state: 'NV' }),
];
vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'u1', isAdmin: true, displayName: 'A' }),
}));
vi.mock('@/lib/organization-representatives', () => ({
  useMyOrganizations: () => ({ ids: new Set(), loading: false }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations,
    byId: new Map(organizations.map((o) => [o.id, o])),
    loading: false,
    error: null,
  }),
}));
vi.mock('@/lib/events', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEvents: () => ({ events: [], loading: false, error: null }),
}));
vi.mock('@/lib/event-audience', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAudienceGroups: () => Promise.resolve({ ok: true, groups: [] }),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { default: EventFormPage } = await import('@/routes/events/event-form');

function renderForm() {
  render(
    <MemoryRouter initialEntries={['/events/new']}>
      <Routes>
        <Route path="/events/new" element={<EventFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("an event's state on its form", () => {
  it("follows the host's state until somebody chooses one", async () => {
    renderForm();
    const host = await screen.findByLabelText('Who is hosting it?');
    const state = screen.getByLabelText('State');
    await userEvent.selectOptions(host, 'borp');
    expect(state).toHaveValue('CA');
    await userEvent.selectOptions(host, 'hf');
    expect(state).toHaveValue('NV');
    await userEvent.selectOptions(state, 'OR');
    await userEvent.selectOptions(host, 'borp');
    expect(state).toHaveValue('OR');
  });
});
