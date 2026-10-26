import { act, render, screen, waitFor } from '@testing-library/react';
import { Activity, Component, type ReactNode, useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MapContents } from '@/lib/map-data';
import { makeEvent, makeMember } from '@/test/factory';

type Handler = (event: unknown) => void;

/** A map as MapLibre's behaves after remove(): any use of its style throws. */
function fakeMap() {
  const handlers = new Map<string, Set<Handler>>();
  let removed = false;
  const alive =
    <T,>(answer: T) =>
    (..._args: unknown[]): T => {
      if (removed)
        throw new TypeError("Cannot read properties of null (reading 'setLayoutProperty')");
      return answer;
    };
  return {
    handlers,
    setData: vi.fn(() => Promise.resolve()),
    remove() {
      removed = true;
    },
    addSource: alive(undefined),
    getSource(this: { setData: () => Promise<void> }) {
      return { setData: this.setData };
    },
    addLayer: alive(undefined),
    getLayer: () => true,
    setLayoutProperty: alive(undefined),
    setPaintProperty: alive(undefined),
    hasImage: () => true,
    addImage: alive(undefined),
    on: (type: string, handler: Handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(handler);
    },
    off: (type: string, handler: Handler) => {
      handlers.get(type)?.delete(handler);
    },
    getBounds: () => ({
      getWest: () => -123,
      getSouth: () => 37,
      getEast: () => -121,
      getNorth: () => 38,
    }),
    queryRenderedFeatures: alive([] as unknown[]),
    getCanvas: () => ({ style: {} }),
    easeTo: alive(undefined),
    getZoom: () => 10,
  };
}

const made = vi.hoisted(() => ({ maps: [] as ReturnType<typeof fakeMap>[] }));

// MapCanvas's lifecycle: a map per mount, onReady once its style is in,
// onReady(null) and remove() when hidden or unmounted.
vi.mock('@/lib/map', () => ({
  MAP_FONT: 'Noto Sans Regular',
  loadMapCanvas: () =>
    Promise.resolve({
      default: function FakeCanvas({
        onReady,
        controls,
      }: {
        onReady: (map: unknown) => void;
        controls?: ReactNode;
      }) {
        useEffect(() => {
          const map = fakeMap();
          made.maps.push(map);
          const styled = setTimeout(() => {
            onReady(map);
          }, 0);
          return () => {
            clearTimeout(styled);
            onReady(null);
            map.remove();
          };
        }, [onReady]);
        return <div>{controls}</div>;
      },
    }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: [], byId: new Map(), loading: false, error: null }),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { default: ClubMap } = await import('@/routes/map/club-map');

const contents: MapContents = {
  events: [{ id: 'e1', latitude: 37.87, longitude: -122.27, exact: true }],
  peerCities: [
    { city: 'Oakland', state: 'CA', latitude: 37.8, longitude: -122.27, memberIds: ['a'] },
  ],
  organizations: [],
  home: null,
};
const events = [makeEvent({ id: 'e1' })];
const members = [makeMember({ id: 'a' })];

class Caught extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  override render() {
    return this.state.error ? <p>Broke: {this.state.error}</p> : this.props.children;
  }
}

function Tab({ mode }: { mode: 'visible' | 'hidden' }) {
  return (
    <MemoryRouter>
      <Caught>
        <Activity mode={mode}>
          <ClubMap
            contents={contents}
            focus="events"
            events={events}
            members={members}
            filters={{ label: 'Filter events', count: 0, onOpen: () => undefined }}
            backState={{}}
            onUnsupported={() => undefined}
          />
        </Activity>
      </Caught>
    </MemoryRouter>
  );
}

describe('the map in a kept tab, hidden and shown again', () => {
  it('leaves the removed map alone and draws on the new one', async () => {
    const { rerender } = render(<Tab mode="visible" />);
    await waitFor(() => {
      expect(made.maps[0]?.handlers.get('moveend')?.size).toBe(1);
    });
    act(() => {
      rerender(<Tab mode="hidden" />);
    });
    await act(async () => {
      rerender(<Tab mode="visible" />);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByText(/^Broke:/)).toBeNull();
    expect(made.maps).toHaveLength(2);
    // The new map has its handlers and its pins.
    await waitFor(() => {
      expect(made.maps[1]?.handlers.get('moveend')?.size).toBe(1);
    });
    expect(screen.queryByText(/^Broke:/)).toBeNull();
    expect(made.maps[1]?.setData).toHaveBeenCalled();
  });

  it('survives being hidden and shown again before React has caught up', async () => {
    made.maps = [];
    const { rerender } = render(<Tab mode="visible" />);
    await waitFor(() => {
      expect(made.maps[0]?.handlers.get('moveend')?.size).toBe(1);
    });
    act(() => {
      rerender(<Tab mode="hidden" />);
      rerender(<Tab mode="visible" />);
    });
    await waitFor(() => {
      expect(made.maps.at(-1)?.handlers.get('moveend')?.size).toBe(1);
    });
    expect(screen.queryByText(/^Broke:/)).toBeNull();
  });
});
