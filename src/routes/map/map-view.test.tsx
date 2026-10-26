import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MapData } from '@/lib/map-data';

const EMPTY = { events: [], peerCities: [], organizations: [], home: null };
vi.mock('@/lib/map-data', () => ({
  useMapData: (): MapData => ({
    status: 'ready',
    retry: () => undefined,
    ...EMPTY,
    contents: EMPTY,
  }),
}));

const load = vi.hoisted(() => ({ failures: 0 }));
vi.mock('@/routes/map/view-switch', () => ({
  loadClubMap: () =>
    load.failures-- > 0
      ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
      : Promise.resolve({ default: () => <p>The map</p> }),
}));

const { MapView } = await import('@/routes/map/map-view');

function View() {
  return (
    <MapView
      hidden={false}
      onProblem={() => undefined}
      focus="events"
      filters={{ label: 'Filter events', count: 0, onOpen: () => undefined }}
      backState={{}}
    />
  );
}

describe('the map screen loading', () => {
  it('offers to try again when its script fails, and asks for it again', async () => {
    load.failures = 1;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<View />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try the map again' }));
    expect(await screen.findByText('The map')).toBeInTheDocument();
  });

  it('opens a second map after the first, as Events then Peers do', async () => {
    load.failures = 0;
    const first = render(<View />);
    expect(await screen.findByText('The map')).toBeInTheDocument();
    first.unmount();
    render(<View />);
    expect(await screen.findByText('The map')).toBeInTheDocument();
  });
});
