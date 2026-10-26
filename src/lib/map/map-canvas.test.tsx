import { render } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const made = vi.hoisted(() => ({ styles: [] as string[], setStyle: vi.fn() }));
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor(options: { style: { sprite: string } }) {
      made.styles.push(options.style.sprite);
    }
    touchZoomRotate = { disableRotation: vi.fn() };
    keyboard = { disableRotation: vi.fn() };
    once = vi.fn();
    remove = vi.fn();
    setStyle = made.setStyle;
    getCenter = () => ({ lng: -122, lat: 37 });
    getZoom = () => 10;
  },
  Marker: vi.fn(),
}));
vi.mock('./archives', () => ({ warmMap: vi.fn() }));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const { default: MapCanvas } = await import('./map-canvas');

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

let theme = 'light';
vi.spyOn(window, 'getComputedStyle').mockImplementation(
  () => ({ colorScheme: theme }) as unknown as CSSStyleDeclaration,
);

afterEach(() => {
  made.styles = [];
  made.setStyle.mockClear();
  theme = 'light';
});

describe('a map hidden in a kept tab', () => {
  it('opens again in the theme of now, loading its style once', () => {
    const { rerender } = render(
      <Activity mode="visible">
        <MapCanvas />
      </Activity>,
    );
    rerender(
      <Activity mode="hidden">
        <MapCanvas />
      </Activity>,
    );
    theme = 'dark';
    document.documentElement.dataset.appearance = 'dark';
    rerender(
      <Activity mode="visible">
        <MapCanvas />
      </Activity>,
    );
    delete document.documentElement.dataset.appearance;
    expect(made.styles.map((sprite) => sprite.split('/').at(-1))).toEqual(['light', 'dark']);
    expect(made.setStyle).not.toHaveBeenCalled();
  });

  it('says when its map is removed, so nothing uses it again', () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <Activity mode="visible">
        <MapCanvas onReady={onReady} />
      </Activity>,
    );
    rerender(
      <Activity mode="hidden">
        <MapCanvas onReady={onReady} />
      </Activity>,
    );
    expect(onReady).toHaveBeenLastCalledWith(null);
  });
});
