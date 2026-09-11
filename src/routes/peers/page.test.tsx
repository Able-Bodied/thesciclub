import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MembersState } from '@/lib/members';
import { makeMember } from '@/test/factory';

const state = vi.hoisted(() => ({ current: null as MembersState | null }));
vi.mock('@/lib/members', () => ({
  useBrowseMembers: () => state.current,
}));

const { default: PeersPage } = await import('@/routes/peers/page');

/** Cards navigate to a profile, so the page needs a router around it. */
function renderPage() {
  return render(
    <MemoryRouter>
      <PeersPage />
    </MemoryRouter>,
  );
}

const deck = [
  makeMember({
    id: '1',
    displayName: 'Nicole',
    type: 'peer',
    city: 'Santa Clara',
    region: 'Cervical',
  }),
  makeMember({
    id: '2',
    displayName: 'Todd',
    type: 'mentor',
    city: 'Roseville',
    region: 'Thoracic',
  }),
  makeMember({
    id: '3',
    displayName: 'Kerry',
    type: 'mentor',
    city: 'San Jose',
    region: 'Thoracic',
  }),
];

beforeEach(() => {
  state.current = { members: deck, loading: false, error: null, signedOut: false };
});

describe('PeersPage', () => {
  it('lists every member on the Everyone segment', async () => {
    renderPage();
    expect(await screen.findByText('Nicole')).toBeInTheDocument();
    expect(screen.getByText('Todd')).toBeInTheDocument();
    expect(screen.getByText('Kerry')).toBeInTheDocument();
  });

  it('narrows to mentors when that segment is chosen', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Mentors' }));
    expect(screen.queryByText('Nicole')).not.toBeInTheDocument();
    expect(screen.getByText('Todd')).toBeInTheDocument();
  });

  it('narrows to nearby cities on Near me', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Near me' }));
    expect(screen.getByText('Kerry')).toBeInTheDocument();
    expect(screen.queryByText('Todd')).not.toBeInTheDocument();
  });

  it('says how many of how many are showing', async () => {
    renderPage();
    expect(await screen.findByText('3 of 3 members')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mentors' }));
    expect(screen.getByText('2 of 2 members')).toBeInTheDocument();
  });

  it('tells a signed-out visitor the club is members only, not "permission denied"', () => {
    state.current = { members: [], loading: false, error: null, signedOut: true };
    renderPage();
    expect(screen.getByText(/members only/i)).toBeInTheDocument();
    expect(screen.queryByText(/permission denied/i)).not.toBeInTheDocument();
  });

  it('still surfaces a genuine database error, which is a different thing', () => {
    state.current = {
      members: [],
      loading: false,
      error: 'permission denied for view browse_members',
      signedOut: false,
    };
    renderPage();
    expect(screen.getByText('permission denied for view browse_members')).toBeInTheDocument();
  });

  it('shows a loading state rather than an empty deck', () => {
    state.current = { members: [], loading: true, error: null, signedOut: false };
    renderPage();
    expect(screen.getByText(/Loading members/)).toBeInTheDocument();
  });

  it('surfaces the database’s own error sentence instead of swallowing it', () => {
    state.current = {
      members: [],
      loading: false,
      error: 'permission denied for view',
      signedOut: false,
    };
    renderPage();
    expect(screen.getByText('permission denied for view')).toBeInTheDocument();
  });

  it('tells somebody the deck is empty because of their filters, not because the club is', async () => {
    state.current = { members: [], loading: false, error: null, signedOut: false };
    renderPage();
    await waitFor(() => expect(screen.getByText(/Nobody matches that yet/)).toBeInTheDocument());
  });

  it('marks the active segment for assistive technology', async () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mentors' }));
    expect(screen.getByRole('button', { name: 'Mentors' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('the filter sheet', () => {
  const open = async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    return screen.getByRole('dialog', { name: 'Filter peers' });
  };

  it('opens, and closes on Escape', async () => {
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Filter peers' })).not.toBeInTheDocument();
  });

  it('gives the backdrop an accessible name instead of being a dead div', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Close filters' })).toBeInTheDocument();
  });

  it('offers only options that exist in the club, so no chip can match nobody', async () => {
    const sheet = await open();
    // The deck has Cervical and Thoracic members but nobody lumbar.
    expect(within(sheet).getByRole('button', { name: 'Cervical' })).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: 'Lumbar & sacral' }),
    ).not.toBeInTheDocument();
  });

  it('narrows the deck when a chip is chosen', async () => {
    const sheet = await open();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cervical' }));
    await userEvent.click(within(sheet).getByRole('button', { name: /^Show/ }));
    expect(screen.getByText('Nicole')).toBeInTheDocument();
    expect(screen.queryByText('Todd')).not.toBeInTheDocument();
  });

  it('counts matches live, before the sheet is even closed', async () => {
    const sheet = await open();
    expect(within(sheet).getByRole('button', { name: 'Show 3' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cervical' }));
    expect(within(sheet).getByRole('button', { name: 'Show 1' })).toBeInTheDocument();
  });

  it('clears back to everybody', async () => {
    const sheet = await open();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cervical' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Clear (1)' }));
    expect(within(sheet).getByRole('button', { name: 'Show 3' })).toBeInTheDocument();
  });

  it('disables Clear when there is nothing to clear', async () => {
    const sheet = await open();
    expect(within(sheet).getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('marks chosen chips for assistive technology', async () => {
    const sheet = await open();
    const chip = within(sheet).getByRole('button', { name: 'Cervical' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(within(sheet).getByRole('button', { name: 'Cervical' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
