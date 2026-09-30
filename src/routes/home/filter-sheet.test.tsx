import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeFilterSheet, type HomeFilterSheetProps } from '@/routes/home/filter-sheet';
import { EMPTY_FEED_FILTERS } from '@/routes/home/filters';
import { makeRoom } from '@/test/factory';

/** The sheet draws the chips it is handed; which chips those are is `chipsFor`'s test. */

function renderSheet(overrides: Partial<HomeFilterSheetProps> = {}) {
  const props: HomeFilterSheetProps = {
    chips: {
      rooms: [
        makeRoom({ id: 'bowel', name: 'Bowel management' }),
        makeRoom({ id: 'sport', name: 'Adaptive sport' }),
      ],
      cities: ['San Jose', 'Aptos'],
      online: true,
    },
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
    expect(
      group('Where')
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['San Jose', 'Aptos', 'Online']);
  });

  it('marks a chip that is on as pressed', () => {
    renderSheet({ filters: { rooms: ['sport'], cities: [], online: true }, activeCount: 2 });
    expect(screen.getByRole('button', { name: 'Adaptive sport' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Bowel management' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Online' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Clear (2)' })).toBeEnabled();
  });

  it('hands back the filters with a room, a city or Online toggled', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet({
      filters: { rooms: ['bowel'], cities: [], online: false },
    });
    await user.click(screen.getByRole('button', { name: 'Adaptive sport' }));
    expect(onChange).toHaveBeenLastCalledWith({
      rooms: ['bowel', 'sport'],
      cities: [],
      online: false,
    });
    await user.click(screen.getByRole('button', { name: 'Aptos' }));
    expect(onChange).toHaveBeenLastCalledWith({
      rooms: ['bowel'],
      cities: ['Aptos'],
      online: false,
    });
    await user.click(screen.getByRole('button', { name: 'Online' }));
    expect(onChange).toHaveBeenLastCalledWith({ rooms: ['bowel'], cities: [], online: true });
  });

  it('clears, and closes from Show', async () => {
    const user = userEvent.setup();
    const { onClear, onClose } = renderSheet({ activeCount: 1 });
    await user.click(screen.getByRole('button', { name: 'Clear (1)' }));
    expect(onClear).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Show 14' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('draws no empty group, and says so when there is nothing to narrow by', () => {
    renderSheet({ chips: { rooms: [], cities: [], online: false } });
    expect(screen.queryByRole('heading', { name: 'Rooms' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Where' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Nothing in this list has a room or a place to narrow by.'),
    ).toBeInTheDocument();
  });

  it('says the pills filter by kind and this narrows inside them', () => {
    renderSheet();
    expect(
      screen.getByText(
        'The pills across the top filter by kind. This narrows what is inside them.',
      ),
    ).toBeInTheDocument();
  });
});
