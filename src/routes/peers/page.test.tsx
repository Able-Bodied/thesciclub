import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MembersState } from '@/lib/members';
import { makeMember } from '@/test/factory';

const state = vi.hoisted(() => ({ current: null as MembersState | null }));
vi.mock('@/lib/members', () => ({
  useBrowseMembers: () => state.current,
}));

const { default: PeersPage } = await import('@/routes/peers/page');

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
  state.current = { members: deck, loading: false, error: null };
});

describe('PeersPage', () => {
  it('lists every member on the Everyone segment', async () => {
    render(<PeersPage />);
    expect(await screen.findByText('Nicole')).toBeInTheDocument();
    expect(screen.getByText('Todd')).toBeInTheDocument();
    expect(screen.getByText('Kerry')).toBeInTheDocument();
  });

  it('narrows to mentors when that segment is chosen', async () => {
    render(<PeersPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Mentors' }));
    expect(screen.queryByText('Nicole')).not.toBeInTheDocument();
    expect(screen.getByText('Todd')).toBeInTheDocument();
  });

  it('narrows to nearby cities on Near me', async () => {
    render(<PeersPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Near me' }));
    expect(screen.getByText('Kerry')).toBeInTheDocument();
    expect(screen.queryByText('Todd')).not.toBeInTheDocument();
  });

  it('says how many of how many are showing', async () => {
    render(<PeersPage />);
    expect(await screen.findByText('3 of 3 members')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mentors' }));
    expect(screen.getByText('2 of 2 members')).toBeInTheDocument();
  });

  it('shows a loading state rather than an empty deck', () => {
    state.current = { members: [], loading: true, error: null };
    render(<PeersPage />);
    expect(screen.getByText(/Loading members/)).toBeInTheDocument();
  });

  it('surfaces the database’s own error sentence instead of swallowing it', () => {
    state.current = { members: [], loading: false, error: 'permission denied for view' };
    render(<PeersPage />);
    expect(screen.getByText('permission denied for view')).toBeInTheDocument();
  });

  it('tells somebody the deck is empty because of their filters, not because the club is', async () => {
    state.current = { members: [], loading: false, error: null };
    render(<PeersPage />);
    await waitFor(() => expect(screen.getByText(/Nobody matches that yet/)).toBeInTheDocument());
  });

  it('marks the active segment for assistive technology', async () => {
    render(<PeersPage />);
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

describe('the filter sheet is reachable without a mouse', () => {
  it('opens, and closes on Escape', async () => {
    render(<PeersPage />);
    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('gives the backdrop an accessible name instead of being a dead div', async () => {
    render(<PeersPage />);
    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByRole('button', { name: 'Close filters' })).toBeInTheDocument();
  });
});
