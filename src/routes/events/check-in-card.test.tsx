import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckInCard } from '@/routes/events/check-in-card';

const api = vi.hoisted(() => ({
  checkedIn: false,
  rpc: { data: null as string | null, error: null as { message: string } | null },
  calls: [] as unknown[],
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () =>
          Promise.resolve({ data: api.checkedIn ? { event_id: 'e1' } : null, error: null }),
      };
      return query;
    },
    rpc: (name: string, args: unknown) => {
      api.calls.push([name, args]);
      return Promise.resolve(api.rpc);
    },
  }),
}));

function renderCard() {
  render(
    <MemoryRouter>
      <CheckInCard eventId="e1" memberId="m1" organizationId="o1" />
    </MemoryRouter>,
  );
}

describe('checking in', () => {
  beforeEach(() => {
    api.checkedIn = false;
    api.rpc = { data: null, error: null };
    api.calls = [];
  });

  it('checks in with one press', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /check in/ }));
    expect(api.calls).toEqual([['check_in_to_event', { p_event: 'e1' }]]);
    expect(await screen.findByText("You're checked in")).toBeInTheDocument();
    expect(screen.queryByText(/now a member/)).toBeNull();
  });

  it('says so when it makes them a member of the organization', async () => {
    api.rpc = { data: 'NorCal SCI', error: null };
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /check in/ }));
    expect(await screen.findByText(/now a member of NorCal SCI/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See NorCal SCI' })).toHaveAttribute(
      'href',
      '/events/organizations/o1',
    );
  });

  it('shows it is done when they come back', async () => {
    api.checkedIn = true;
    renderCard();
    expect(await screen.findByText("You're checked in")).toBeInTheDocument();
  });

  it('says why when the club refuses', async () => {
    api.rpc = { data: null, error: { message: 'Check-in for this event has closed.' } };
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /check in/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('has closed');
  });
});
