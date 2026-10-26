import { Capacitor } from '@capacitor/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// MapCanvas without MapLibre: only its control slot, where the button lives.
vi.mock('@/lib/map', () => ({
  MAP_FONT: 'Noto Sans Regular',
  loadMapCanvas: () =>
    Promise.resolve({ default: ({ controls }: { controls?: ReactNode }) => <div>{controls}</div> }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: [], byId: new Map(), loading: false, error: null }),
}));

// The iPhone app's way (lib/device-location.ts).
const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: plugin }));

const { default: ClubMap } = await import('@/routes/map/club-map');

const getCurrentPosition = vi.fn();
Object.defineProperty(navigator, 'geolocation', {
  value: { getCurrentPosition },
  configurable: true,
});

afterEach(() => {
  getCurrentPosition.mockReset();
  vi.restoreAllMocks();
});

function renderMap() {
  render(
    <MemoryRouter>
      <ClubMap
        contents={{ events: [], peerCities: [], organizations: [], home: null }}
        focus="events"
        events={[]}
        filters={{ label: 'Filter events', count: 0, onOpen: () => undefined }}
        backState={{}}
        onUnsupported={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('Use my location', () => {
  it('asks only when pressed, and only for an approximate position', async () => {
    renderMap();
    const button = await screen.findByRole('button', { name: 'Use my location' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toMatchObject({ enableHighAccuracy: false });
  });

  it('says so, kindly, when location is refused', async () => {
    getCurrentPosition.mockImplementation((_ok: unknown, fail: (e: object) => void) => {
      fail({ code: 1, PERMISSION_DENIED: 1 });
    });
    renderMap();
    await userEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(screen.getByText(/Location is off for the club/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeEnabled();
  });
});

describe('Use my location in the iPhone app', () => {
  function onIphone(answer: 'granted' | 'denied') {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    plugin.checkPermissions.mockResolvedValue({ location: 'prompt' });
    plugin.requestPermissions.mockResolvedValue({ location: answer });
    plugin.getCurrentPosition.mockResolvedValue({
      timestamp: 0,
      coords: { latitude: 37.33, longitude: -121.89, accuracy: 10 },
    });
  }

  it('asks through iOS alone, so WebKit never asks a second time', async () => {
    onIphone('granted');
    renderMap();
    await userEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/Showing where you are/)).toBeInTheDocument();
    expect(plugin.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('says so, kindly, when location is refused', async () => {
    onIphone('denied');
    renderMap();
    await userEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/Location is off for the club/)).toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
