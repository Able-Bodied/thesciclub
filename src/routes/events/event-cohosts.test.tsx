import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent, makeOrganization } from '@/test/factory';

const calls = vi.hoisted(() => ({
  set: vi.fn(() => Promise.resolve({ ok: true as const })),
  leave: vi.fn(() => Promise.resolve({ ok: true as const })),
}));
vi.mock('@/lib/event-cohosts', () => ({
  setEventCohosts: calls.set,
  leaveEventCohost: calls.leave,
}));

const { EventCohosts } = await import('@/routes/events/event-cohosts');

const lead = makeOrganization({ id: 'lead', shortCode: 'LEAD', name: 'Lead Sports' });
const bee = makeOrganization({ id: 'bee', shortCode: 'BEE', name: 'Bee Rowing' });
const cee = makeOrganization({ id: 'cee', shortCode: 'CEE', name: 'Cee Climbing' });
const all = [lead, bee, cee];

function show(props: {
  cohostIds?: string[];
  manages?: boolean;
  mine?: string[];
  seriesId?: string | null;
}) {
  const onChanged = vi.fn();
  const view = render(
    <MemoryRouter>
      <EventCohosts
        event={makeEvent({
          id: 'ev',
          organizationId: 'lead',
          cohostIds: props.cohostIds ?? [],
          seriesId: props.seriesId ?? null,
        })}
        organizations={all}
        byId={new Map(all.map((o) => [o.id, o]))}
        manages={props.manages ?? false}
        mine={new Set(props.mine ?? [])}
        onChanged={onChanged}
      />
    </MemoryRouter>,
  );
  return { ...view, onChanged };
}

describe('EventCohosts', () => {
  beforeEach(() => {
    calls.set.mockClear();
    calls.leave.mockClear();
  });

  it('shows nothing to a member when there are no co-hosts', () => {
    const { container } = show({});
    expect(container).toBeEmptyDOMElement();
  });

  it('lists co-hosts, with no way to change them for an ordinary member', () => {
    show({ cohostIds: ['bee'] });
    expect(screen.getByText('Bee Rowing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a co-host')).not.toBeInTheDocument();
  });

  it('adds a co-host found by search, leaving out the lead and those there already', async () => {
    const { onChanged } = show({ cohostIds: ['bee'], manages: true });
    // Every one is in Northern California; the search starts a word (2026-11-06).
    await userEvent.type(screen.getByLabelText('Add a co-host'), 'north');
    const found = screen.getByRole('list', { name: 'Organizations found' });
    expect(found).toHaveTextContent('Cee Climbing');
    expect(found).not.toHaveTextContent('Lead Sports');
    expect(found).not.toHaveTextContent('Bee Rowing');
    await userEvent.click(screen.getByRole('button', { name: 'Cee Climbing' }));
    expect(calls.set).toHaveBeenCalledWith('ev', ['bee', 'cee'], false);
    expect(onChanged).toHaveBeenCalled();
  });

  it("lets a co-host's own admin take their organization off, and only theirs", async () => {
    show({ cohostIds: ['bee', 'cee'], mine: ['bee'] });
    expect(
      screen.queryByRole('button', { name: 'Remove Cee Climbing as co-host' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bee Rowing as co-host' }));
    expect(calls.leave).toHaveBeenCalledWith('ev', 'bee', false);
  });

  it('changes the later dates of a repeating event unless told not to', async () => {
    show({ cohostIds: ['bee'], manages: true, seriesId: 'weekly' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bee Rowing as co-host' }));
    expect(calls.leave).toHaveBeenLastCalledWith('ev', 'bee', true);
    await userEvent.click(screen.getByLabelText('Later dates of this repeating event too'));
    await userEvent.type(screen.getByLabelText('Add a co-host'), 'Cee');
    await userEvent.click(screen.getByRole('button', { name: 'Cee Climbing' }));
    expect(calls.set).toHaveBeenLastCalledWith('ev', ['bee', 'cee'], false);
  });
});
