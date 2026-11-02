import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeFilterSheet, type HomeFilterSheetProps } from '@/routes/home/filter-sheet';
import { EMPTY_FEED_FILTERS } from '@/routes/home/filters';
import { makeRoom } from '@/test/factory';

/** The sheet draws the chips it is handed; which chips those are is `chipsFor`'s test. */

function renderSheet(overrides: Partial<HomeFilterSheetProps> = {}) {
  const props: HomeFilterSheetProps = {
    segments: [
      ['everything', 'Everything'],
      ['events', 'Events'],
    ],
    segment: 'everything',
    onSegment: vi.fn(),
    chips: {
      rooms: [
        makeRoom({ id: 'bowel', name: 'Bowel management' }),
        makeRoom({ id: 'sport', name: 'Adaptive sport' }),
      ],
    },
    home: { city: 'San Jose', status: 'ready' },
    filters: EMPTY_FEED_FILTERS,
    matchCount: 14,
    total: 31,
    activeCount: 0,
    onChange: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<HomeFilterSheet {...props} />);
  return props;
}

function group(name: string) {
  const section = screen.getByRole('heading', { name }).closest('section');
  if (!section) throw new Error(`No group headed ${name}`);
  return within(section);
}

describe('HomeFilterSheet', () => {
  it('is a dialog named Filter your feed, with the count', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Filter your feed' })).toBeInTheDocument();
    expect(screen.getByText('14 of 31 match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 14' })).toBeInTheDocument();
  });

  it('says "matches" for one', () => {
    renderSheet({ matchCount: 1 });
    expect(screen.getByText('1 of 31 matches')).toBeInTheDocument();
  });

  it('offers the rooms, then the places with Online last', () => {
    renderSheet();
    expect(
      group('Rooms')
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Bowel management', 'Adaptive sport']);
  });

  it('marks a chip that is on as pressed', () => {
    renderSheet({ filters: { rooms: ['sport'], withinMiles: 50 }, activeCount: 2 });
    expect(screen.getByRole('button', { name: 'Adaptive sport' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Bowel management' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Clear (2)' })).toBeEnabled();
  });

  it('hands back the filters with a room toggled', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet({ filters: { rooms: ['bowel'], withinMiles: 50 } });
    await user.click(screen.getByRole('button', { name: 'Adaptive sport' }));
    expect(onChange).toHaveBeenLastCalledWith({ rooms: ['bowel', 'sport'], withinMiles: 50 });
  });

  it('asks how far, for events and peers alone', () => {
    renderSheet();
    expect(screen.getByLabelText('Any distance')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Where' })).not.toBeInTheDocument();
    expect(screen.getByText(/For events and peers/)).toBeInTheDocument();
  });

  it('clears, and closes from Show', async () => {
    const user = userEvent.setup();
    const { onClear, onClose } = renderSheet({ activeCount: 1 });
    await user.click(screen.getByRole('button', { name: 'Clear (1)' }));
    expect(onClear).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Show 14' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('draws no empty group', () => {
    renderSheet({ chips: { rooms: [] } });
    expect(screen.queryByRole('heading', { name: 'Rooms' })).not.toBeInTheDocument();
  });

  it('chooses what Home shows', async () => {
    const props = renderSheet();
    expect(screen.getByRole('button', { name: 'Everything' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(props.onSegment).toHaveBeenCalledWith('events');
  });
});
