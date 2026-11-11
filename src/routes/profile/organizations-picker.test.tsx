import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nearbyOrganizations, OrganizationsPicker } from '@/routes/profile/organizations-picker';
import { makeOrganization } from '@/test/factory';

const state = vi.hoisted(() => ({
  organizations: [] as ReturnType<typeof makeOrganization>[],
  following: new Set<string>(),
  requested: new Set<string>(),
  error: null as string | null,
  toggle: vi.fn(),
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: state.organizations, loading: false }),
}));
vi.mock('@/lib/organization-follows', () => ({
  useOrganizationFollows: () => ({
    following: state.following,
    requested: state.requested,
    error: state.error,
    toggle: state.toggle,
  }),
}));
vi.mock('@/routes/profile/profile-api', () => ({
  loadOwnPlace: () => Promise.resolve({ city: 'San Jose', state: 'CA' }),
}));

const near = makeOrganization({ id: 'near', name: 'NorCal SCI', city: 'San Jose', state: 'CA' });
const state2 = makeOrganization({ id: 'state', name: 'Ride On', city: 'Fresno', state: 'CA' });
const far = makeOrganization({ id: 'far', name: 'Peak Adaptive', city: 'Denver', state: 'CO' });

beforeEach(() => {
  state.organizations = [far, state2, near];
  state.following = new Set();
  state.requested = new Set();
  state.error = null;
  state.toggle = vi.fn();
});

describe('the organizations near a member', () => {
  it('puts their city first, then their state, and leaves out the rest', () => {
    expect(
      nearbyOrganizations([far, state2, near], { city: 'san jose', state: 'ca' }).map((o) => o.id),
    ).toEqual(['near', 'state']);
  });

  it('finds an organization by a place of its own', () => {
    const elsewhere = makeOrganization({
      id: 'branch',
      city: 'Denver',
      state: 'CO',
      places: [
        {
          id: 'p',
          position: 0,
          label: null,
          address: null,
          city: 'San Jose',
          state: 'CA',
          postalCode: null,
        },
      ],
    });
    expect(nearbyOrganizations([elsewhere], { city: 'San Jose', state: 'CA' })).toEqual([
      elsewhere,
    ]);
  });

  it('offers none to somebody with no state', () => {
    expect(nearbyOrganizations([near], { city: 'San Jose', state: null })).toEqual([]);
    expect(nearbyOrganizations([near], null)).toEqual([]);
  });

  it('keeps to a few', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      makeOrganization({ id: String(i), name: `Org ${String(i)}`, state: 'CA' }),
    );
    expect(nearbyOrganizations(many, { city: 'x', state: 'CA' })).toHaveLength(6);
  });
});

describe('the organizations picker', () => {
  it('joins from a button near the member', async () => {
    render(<OrganizationsPicker />);
    await userEvent.click(await screen.findByRole('button', { name: 'NorCal SCI' }));
    expect(state.toggle).toHaveBeenCalledWith('near');
  });

  // The owner, 2026-11-10: searched for, ticked as many as they belong to.
  it('finds the others by name or city, and ticks as many as they like', async () => {
    state.following = new Set(['near']);
    render(<OrganizationsPicker />);
    await screen.findByRole('button', { name: 'NorCal SCI' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    const search = screen.getByRole('searchbox', { name: 'Find others' });
    await userEvent.type(search, 'denver');
    await userEvent.click(screen.getByRole('checkbox', { name: /Peak Adaptive/ }));
    expect(state.toggle).toHaveBeenCalledWith('far');
    await userEvent.clear(search);
    await userEvent.type(search, 'ca');
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(
      ['NorCal SCISan Jose, CA', 'Ride OnFresno, CA'],
    );
    // One they are in is ticked here too.
    expect(screen.getByRole('checkbox', { name: /NorCal SCI/ })).toBeChecked();
    await userEvent.type(search, 'zzz');
    expect(screen.getByText(/No organization matches that/)).toBeInTheDocument();
  });

  it('shows one the member is in as chosen, wherever it is', async () => {
    state.following = new Set(['far']);
    render(<OrganizationsPicker />);
    expect(await screen.findByRole('button', { name: 'Peak Adaptive' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says when it has only been asked', async () => {
    state.requested = new Set(['far']);
    render(<OrganizationsPicker />);
    expect(
      await screen.findByRole('button', { name: /Peak Adaptive · Requested/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('says so when joining is refused', () => {
    state.error = 'NorCal SCI declined your membership.';
    render(<OrganizationsPicker />);
    expect(screen.getByRole('alert')).toHaveTextContent('declined your membership');
  });
});
