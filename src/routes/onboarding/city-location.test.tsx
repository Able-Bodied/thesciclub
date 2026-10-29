import { Capacitor } from '@capacitor/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityStep } from '@/routes/onboarding/steps';
import type { OnboardingData } from '@/routes/onboarding/types';

const { reverseGeocode } = vi.hoisted(() => ({ reverseGeocode: vi.fn() }));
vi.mock('@/lib/geocode', () => ({ reverseGeocode, geocodeZip: vi.fn() }));

// The iPhone app's way (lib/device-location.ts).
const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: plugin }));

const getCurrentPosition = vi.fn();
Object.defineProperty(navigator, 'geolocation', {
  value: { getCurrentPosition },
  configurable: true,
});

const data = { ...({} as OnboardingData), zip: '', state: '', city: '' };

afterEach(() => {
  vi.restoreAllMocks();
  getCurrentPosition.mockReset();
  reverseGeocode.mockReset();
  for (const fn of Object.values(plugin)) fn.mockReset();
});

function onIphone(answer: 'granted' | 'denied') {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
  plugin.checkPermissions.mockResolvedValue({ location: 'prompt' });
  plugin.requestPermissions.mockResolvedValue({ location: answer });
  plugin.getCurrentPosition.mockResolvedValue({
    timestamp: 0,
    coords: { latitude: 38.58, longitude: -121.49, accuracy: 10 },
  });
}

describe('Use my location while joining', () => {
  it('fills in the city from the browser’s position', async () => {
    getCurrentPosition.mockImplementation((ok: (p: object) => void) => {
      ok({ coords: { latitude: 38.58, longitude: -121.49, accuracy: 900 } });
    });
    reverseGeocode.mockResolvedValue({ city: 'Sacramento', state: 'CA' });
    const set = vi.fn();
    render(<CityStep data={data} set={set} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => {
      expect(set).toHaveBeenCalledWith({ city: 'Sacramento', state: 'CA' });
    });
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      timeout: 10000,
      enableHighAccuracy: true,
    });
  });

  it('fills in the ZIP code too, from a close enough position', async () => {
    getCurrentPosition.mockImplementation((ok: (p: object) => void) => {
      ok({ coords: { latitude: 38.58, longitude: -121.49, accuracy: 40 } });
    });
    reverseGeocode.mockResolvedValue({ city: 'Sacramento', state: 'CA', zip: '95814' });
    const set = vi.fn();
    render(<CityStep data={data} set={set} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => {
      expect(set).toHaveBeenCalledWith({ city: 'Sacramento', state: 'CA', zip: '95814' });
    });
  });

  // The owner, 2026-10-28: a laptop placed by Wi-Fi gave the next ZIP over.
  it('fills in the ZIP code and says to check it', async () => {
    getCurrentPosition.mockImplementation((ok: (p: object) => void) => {
      ok({ coords: { latitude: 37.25, longitude: -121.95, accuracy: 1500 } });
    });
    reverseGeocode.mockResolvedValue({ city: 'Los Gatos', state: 'CA', zip: '95032' });
    const set = vi.fn();
    render(<CityStep data={data} set={set} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/Check it is right/)).toBeInTheDocument();
    expect(set).toHaveBeenCalledWith({ city: 'Los Gatos', state: 'CA', zip: '95032' });
  });

  it('in the iPhone app, asks through iOS alone', async () => {
    onIphone('granted');
    reverseGeocode.mockResolvedValue({ city: 'Sacramento', state: 'CA' });
    const set = vi.fn();
    render(<CityStep data={data} set={set} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => {
      expect(set).toHaveBeenCalledWith({ city: 'Sacramento', state: 'CA' });
    });
    expect(reverseGeocode).toHaveBeenCalledWith(38.58, -121.49);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('in the iPhone app, says so when refused, and sends nothing', async () => {
    onIphone('denied');
    render(<CityStep data={data} set={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Location permission denied');
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeEnabled();
  });
});
