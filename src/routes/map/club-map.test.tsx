import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapContents } from '@/lib/map-data';
import { makeEvent, makeMember, makeOrganization } from '@/test/factory';
import type { ClubEvent, Organization } from '@/types/domain';

type Handler = (event: unknown) => void;

/** Enough of MapLibre's map for the screen: it records what is asked of it. */
function fakeMap() {
  const handlers = new Map<string, Set<Handler>>();
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  return {
    handlers,
    sources,
    addSource: (id: string) => {
      sources.set(id, { setData: vi.fn(() => Promise.resolve()) });
    },
    getSource: (id: string) => sources.get(id),
    addLayer: vi.fn(),
    getLayer: () => true,
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    hasImage: () => true,
    addImage: vi.fn(),
    on: (type: string, handler: Handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(handler);
    },
    off: (type: string, handler: Handler) => {
      handlers.get(type)?.delete(handler);
    },
    fire(type: string, event: unknown = {}) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
    getBounds: () => ({
      getWest: () => -123,
      getSouth: () => 37,
      getEast: () => -121,
      getNorth: () => 38.5,
    }),
    queryRenderedFeatures: vi.fn((): unknown[] => []),
    getCanvas: () => ({ style: {} as Record<string, string> }),
    easeTo: vi.fn(),
    getZoom: () => 10,
    doubleClickZoom: { disable: vi.fn() },
  };
}

const the = vi.hoisted(() => ({ map: null as ReturnType<typeof fakeMap> | null }));

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
          if (the.map) onReady(the.map);
        }, [onReady]);
        return <div>{controls}</div>;
      },
    }),
}));

const directory = vi.hoisted(() => ({ organizations: [] as Organization[] }));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: directory.organizations,
    byId: new Map(),
    loading: false,
    error: null,
  }),
}));
vi.mock('@/lib/organization-follows', () => ({
  useOrganizationFollows: () => ({
    following: new Set(),
    loading: false,
    error: null,
    toggle: vi.fn(),
  }),
}));
vi.mock('@/lib/grants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGrantsByOrganization: () => new Map(),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { default: ClubMap } = await import('@/routes/map/club-map');

const borp = makeOrganization({ id: 'borp', name: 'BORP', city: 'Berkeley' });
const contents: MapContents = {
  events: [{ id: 'e1', latitude: 37.87, longitude: -122.27, exact: true }],
  peerCities: [
    { city: 'Oakland', state: 'CA', latitude: 37.8, longitude: -122.27, memberIds: ['a'] },
  ],
  organizations: [
    {
      placeId: 'p1',
      id: 'borp',
      label: 'Adaptive sports center',
      city: 'Berkeley',
      state: 'CA',
      latitude: 37.85,
      longitude: -122.27,
      exact: true,
    },
    {
      placeId: 'p2',
      id: 'borp',
      label: null,
      city: 'Fremont',
      state: 'CA',
      latitude: 37.55,
      longitude: -121.98,
      exact: false,
    },
  ],
  home: null,
};
const events: ClubEvent[] = [makeEvent({ id: 'e1' })];
const members = [makeMember({ id: 'a' }), makeMember({ id: 'b' }), makeMember({ id: 'c' })];

function Screen({
  bare = false,
  ...props
}: Partial<Parameters<typeof ClubMap>[0]> & { bare?: boolean }) {
  return (
    <MemoryRouter>
      <ClubMap
        contents={contents}
        focus="events"
        events={events}
        {...(bare ? {} : { members })}
        filters={{ label: 'Filter events', count: 0, onOpen: () => undefined }}
        backState={{}}
        onUnsupported={() => undefined}
        {...props}
      />
    </MemoryRouter>
  );
}

/** Once the screen has taken the map and bound its handlers. */
async function ready() {
  await waitFor(() => {
    expect(the.map?.handlers.get('moveend')?.size).toBe(1);
  });
}

const sentTo = (source: string) => the.map?.sources.get(source)?.setData.mock.calls.length ?? 0;

beforeEach(() => {
  the.map = fakeMap();
  directory.organizations = [borp];
});

describe('the map keeps still while its screen re-renders', () => {
  it('sends each source its data once, not on every render', async () => {
    const { rerender } = render(<Screen />);
    await ready();
    for (let i = 0; i < 3; i++) rerender(<Screen />);
    expect(sentTo('club-events')).toBe(1);
    expect(sentTo('club-peers')).toBe(1);
    expect(sentTo('club-organizations')).toBe(1);
  });

  it('sends once even when the screen gives it no list of its own', async () => {
    const { rerender } = render(<Screen bare />);
    await ready();
    for (let i = 0; i < 3; i++) rerender(<Screen bare />);
    expect(sentTo('club-peers')).toBe(1);
  });

  it('sends nothing while the list is showing, and catches up when shown', async () => {
    const { rerender } = render(<Screen hidden />);
    await ready();
    rerender(<Screen hidden events={[...events, makeEvent({ id: 'e2' })]} />);
    expect(sentTo('club-events')).toBe(0);
    rerender(<Screen hidden={false} />);
    expect(sentTo('club-events')).toBe(1);
  });

  it('looks for its first pins when the map settles, not on every frame', async () => {
    render(<Screen />);
    await ready();
    expect(the.map?.handlers.get('render')?.size ?? 0).toBe(0);
    expect(the.map?.handlers.get('idle')?.size).toBe(1);
  });

  it('asks what is under the pointer at most once a frame', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    try {
      render(<Screen />);
      await ready();
      const query = the.map?.queryRenderedFeatures;
      query?.mockClear();
      for (let i = 0; i < 5; i++) the.map?.fire('mousemove', { point: { x: i, y: i } });
      expect(query).not.toHaveBeenCalled();
      frames.shift()?.(0);
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('what the map says', () => {
  it('says past events are not on it, in place of "zoom out"', async () => {
    render(<Screen eventsNote="The map shows upcoming events only. Past ones are in the list." />);
    expect(await screen.findByText(/upcoming events only/)).toBeVisible();
    expect(screen.queryByText(/Zoom out, or change the filters/)).toBeNull();
  });

  it('counts the peers in the list it cannot show, in Layers', async () => {
    render(<Screen focus="peers" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Layers' }));
    expect(screen.getByText(/2 peers in the list aren’t on the map/)).toBeVisible();
  });

  it('hangs Layers under the whole row of chips, however they wrap', async () => {
    render(<Screen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Layers' }));
    const panel = screen.getByRole('checkbox', { name: /Events/ }).closest('div[id]');
    expect(panel?.className).toContain('top-full');
    expect(panel?.className).not.toContain('top-[52px]');
  });

  it("sizes counts and badges to the page's text size", async () => {
    document.documentElement.style.fontSize = '24px';
    try {
      render(<Screen />);
      await ready();
      expect(the.map?.setLayoutProperty).toHaveBeenCalledWith('club-peers', 'text-size', 21);
      expect(the.map?.setLayoutProperty).toHaveBeenCalledWith('club-peers', 'icon-size', 1.5);
    } finally {
      document.documentElement.style.fontSize = '';
    }
  });
});

describe("an organization's places", () => {
  async function openBerkeley() {
    render(<Screen focus="organizations" />);
    await ready();
    the.map?.queryRenderedFeatures.mockReturnValue([
      { source: 'club-organizations', properties: { key: '37.85,-122.27|exact' } },
    ]);
    await act(async () => {
      the.map?.fire('click', { point: { x: 10, y: 10 }, lngLat: { lng: -122.27, lat: 37.85 } });
      await Promise.resolve();
    });
    return screen.findByRole('dialog');
  }

  it('circles its other places and fades every other pin while its sheet is open', async () => {
    await openBerkeley();
    const rings = the.map?.sources
      .get('club-organization-focus')
      ?.setData.mock.calls.at(-1)?.[0] as {
      features: { geometry: { coordinates: number[] } }[];
    };
    expect(rings.features.map((f) => f.geometry.coordinates)).toEqual([[-121.98, 37.55]]);
    expect(the.map?.setPaintProperty).toHaveBeenCalledWith('club-peers', 'icon-opacity', 0.3);
  });

  it('says how many places it has and moves the map to another', async () => {
    await openBerkeley();
    expect(screen.getByText(/2 locations/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Show BORP in Fremont on the map' }));
    expect(the.map?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-121.98, 37.55] }),
    );
  });

  it('lets the pins back when its sheet closes', async () => {
    await openBerkeley();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }),
    );
    expect(the.map?.setPaintProperty).toHaveBeenLastCalledWith(
      'club-organizations',
      'text-opacity',
      1,
    );
  });

  it('draws only the organizations the directory shows', async () => {
    render(<Screen focus="organizations" organizations={[]} />);
    await ready();
    const sent = the.map?.sources.get('club-organizations')?.setData.mock.calls.at(-1)?.[0] as {
      features: unknown[];
    };
    expect(sent.features).toEqual([]);
  });
});

describe('View on the map', () => {
  const placed: MapContents = {
    ...contents,
    events: [
      { id: 'e1', latitude: 37.87, longitude: -122.27, exact: true },
      { id: 'e2', latitude: 37.34, longitude: -121.89, exact: false },
    ],
  };
  const near = makeEvent({ id: 'e1', title: 'Adaptive yoga' });
  const away = makeEvent({ id: 'e2', title: 'Hand cycling ride', city: 'San Jose' });

  it('goes to an exact event at street level and opens its sheet, then says it is done', async () => {
    const shown = vi.fn();
    render(
      <Screen
        contents={placed}
        events={[near]}
        show={{ id: 'e1', event: near, ready: true }}
        onShown={shown}
      />,
    );
    await ready();
    expect(await screen.findByRole('dialog', { name: '1 event here' })).toBeVisible();
    expect(screen.getByText('Adaptive yoga')).toBeVisible();
    expect(the.map?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-122.27, 37.87], zoom: 15 }),
    );
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('goes to an approximate one at city level, saying so, though the filters left it out', async () => {
    render(
      <Screen contents={placed} events={[near]} show={{ id: 'e2', event: away, ready: true }} />,
    );
    await ready();
    expect(await screen.findByText('Hand cycling ride')).toBeVisible();
    expect(screen.getByText('Approximate location')).toBeVisible();
    expect(the.map?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-121.89, 37.34], zoom: 11 }),
    );
    // Drawn as well, so its pin is where the sheet says.
    const drawn = the.map?.sources.get('club-events')?.setData.mock.calls.at(-1)?.[0] as {
      features: { properties: { key: string } }[];
    };
    expect(drawn.features.map((f) => f.properties.key)).toContain('37.34,-121.89|city');
  });

  it('says so politely when the event is not on the map, and goes nowhere', async () => {
    const shown = vi.fn();
    render(
      <Screen
        contents={placed}
        show={{ id: 'gone', event: makeEvent({ id: 'gone' }), ready: true }}
        onShown={shown}
      />,
    );
    await ready();
    expect(await screen.findByText('This event isn’t on the map yet.')).toBeVisible();
    expect(the.map?.easeTo).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('waits until the event is known', async () => {
    const shown = vi.fn();
    render(
      <Screen contents={placed} show={{ id: 'e1', event: null, ready: false }} onShown={shown} />,
    );
    await ready();
    expect(shown).not.toHaveBeenCalled();
    expect(screen.queryByText(/isn’t on the map/)).toBeNull();
  });
});

describe('a double on a pin', () => {
  const at = (coordinates: [number, number]) => ({ type: 'Point', coordinates });
  const exactEvent = {
    source: 'club-events',
    geometry: at([-122.27, 37.87]),
    properties: { key: '37.87,-122.27|exact', count: 1, exact: true },
  };

  /** Two clicks at one point, as MapLibre reports them. */
  function twice(hit: unknown, touch = false) {
    the.map?.queryRenderedFeatures.mockReturnValue(hit ? [hit] : []);
    act(() => {
      for (let i = 0; i < 2; i++) {
        if (touch) the.map?.fire('touchstart');
        the.map?.fire('click', { point: { x: 10, y: 10 }, lngLat: { lng: -122, lat: 37 } });
      }
    });
  }

  it('goes to street level on a single event, and keeps the sheet a mouse opened', async () => {
    render(<Screen />);
    await ready();
    twice(exactEvent);
    await waitFor(() => {
      expect(the.map?.easeTo).toHaveBeenCalledWith({ center: [-122.27, 37.87], zoom: 17 });
    });
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('goes only as close as the city to a place known by its city', async () => {
    render(<Screen focus="organizations" />);
    await ready();
    twice({ ...exactEvent, source: 'club-organizations', properties: { key: 'k', exact: false } });
    await waitFor(() => {
      expect(the.map?.easeTo).toHaveBeenCalledWith({ center: [-122.27, 37.87], zoom: 12 });
    });
  });

  it('takes an organization at its address to street level', async () => {
    render(<Screen focus="organizations" />);
    await ready();
    twice({ ...exactEvent, source: 'club-organizations', properties: { key: 'k', exact: true } });
    await waitFor(() => {
      expect(the.map?.easeTo).toHaveBeenCalledWith({ center: [-122.27, 37.87], zoom: 17 });
    });
  });

  it('never takes a city of members closer than the city', async () => {
    render(<Screen focus="peers" />);
    await ready();
    twice({
      source: 'club-peers',
      geometry: at([-122.27, 37.8]),
      properties: { key: 'Oakland|CA' },
    });
    await waitFor(() => {
      expect(the.map?.easeTo).toHaveBeenCalledWith({ center: [-122.27, 37.8], zoom: 11 });
    });
  });

  it('takes a cluster to where it splits', async () => {
    render(<Screen />);
    await ready();
    const source = the.map?.sources.get('club-events') as unknown as Record<string, unknown>;
    source.getClusterExpansionZoom = vi.fn(() => Promise.resolve(13));
    source.getClusterLeaves = vi.fn(() => Promise.resolve([]));
    twice({
      source: 'club-events',
      geometry: at([-122.2, 37.8]),
      properties: { cluster_id: 7, point_count: 4, count: 4 },
    });
    await waitFor(() => {
      expect(the.map?.easeTo).toHaveBeenCalledWith({ center: [-122.2, 37.8], zoom: 13 });
    });
    expect(source.getClusterExpansionZoom).toHaveBeenCalledWith(7);
  });

  it('steps in as MapLibre would on empty map', async () => {
    render(<Screen />);
    await ready();
    twice(null);
    expect(the.map?.easeTo).toHaveBeenCalledWith({ zoom: 11, around: { lng: -122, lat: 37 } });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a single tap', () => {
  const hit = {
    source: 'club-events',
    geometry: { type: 'Point', coordinates: [-122.27, 37.87] },
    properties: { key: '37.87,-122.27|exact', count: 1, exact: true },
  };
  const tap = (touch: boolean) => {
    act(() => {
      if (touch) the.map?.fire('touchstart');
      the.map?.fire('click', { point: { x: 10, y: 10 }, lngLat: { lng: -122.27, lat: 37.87 } });
    });
  };

  it('opens the sheet at once with a mouse', async () => {
    render(<Screen />);
    await ready();
    the.map?.queryRenderedFeatures.mockReturnValue([hit]);
    tap(false);
    expect(await screen.findByRole('dialog', {}, { timeout: 100 })).toBeVisible();
  });

  it('opens it after the double-tap window with a finger, and never on a double', async () => {
    render(<Screen />);
    await ready();
    the.map?.queryRenderedFeatures.mockReturnValue([hit]);
    tap(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('dialog', {}, { timeout: 400 })).toBeVisible();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }),
    );
    // A double: no sheet, before or after.
    tap(true);
    tap(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(the.map?.easeTo).toHaveBeenCalledWith({ center: [-122.27, 37.87], zoom: 17 });
  });

  it('offers the same up close from the sheet, for a keyboard', async () => {
    render(<Screen />);
    await ready();
    the.map?.queryRenderedFeatures.mockReturnValue([hit]);
    tap(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Show up close' }));
    expect(the.map?.easeTo).toHaveBeenCalledWith({ center: [-122.27, 37.87], zoom: 17 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
