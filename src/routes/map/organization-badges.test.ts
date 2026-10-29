import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  addBadge,
  type BadgeSource,
  forgetBadges,
  setBadgeScale,
  setOrganizationBadges,
} from '@/routes/map/organization-badges';

/** What getImageData reads back: by default a logo that fills its square. */
let paint: (x: number, y: number, size: number) => [number, number, number, number] = () => [
  0, 0, 0, 255,
];
function painted(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(paint(x, y, width), (y * width + x) * 4);
  return data;
}

/** A 2D context that records what was drawn, without roundRect (iOS 15). */
function fakePen() {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };
  const pen = {
    scale: record('scale'),
    beginPath: record('beginPath'),
    arc: record('arc'),
    fill: record('fill'),
    save: record('save'),
    clip: record('clip'),
    restore: record('restore'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    measureText: (text: string) => ({ width: text.length * 7 }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      width,
      height,
      data: painted(width, height),
    }),
    font: '',
    fillStyle: '' as unknown,
    textAlign: '',
    textBaseline: '',
  };
  return { pen, calls };
}

function fakeMap() {
  const images = new Map<string, unknown>();
  return {
    images,
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string, data: unknown) => images.set(id, data)),
    updateImage: vi.fn((id: string, data: unknown) => images.set(id, data)),
    removeImage: vi.fn((id: string) => images.delete(id)),
  };
}

const LOGO = 'organizations/borp/logo.webp';
const URL_SIGNED = 'https://storage.test/sign/photos/organizations/borp/logo.webp?token=t';
const borp = (over: Partial<BadgeSource> = {}): Map<string, BadgeSource> =>
  new Map([['borp', { shortCode: 'BORP', logoPath: LOGO, logoUrl: URL_SIGNED, ...over }]]);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let calls: ReturnType<typeof fakePen>['calls'];
let fetched: Mock<(url: string, init?: RequestInit) => Promise<unknown>>;
const picture = { width: 200, height: 100, close: vi.fn() };
const BLACK: [number, number, number, number] = [0, 0, 0, 255];
/** A black circle on clear, as SCI-FIT's icon. */
const circle = (x: number, y: number, size: number): [number, number, number, number] =>
  Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size / 2 ? BLACK : [0, 0, 0, 0];

beforeEach(() => {
  const made = fakePen();
  calls = made.calls;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    made.pen as unknown as CanvasRenderingContext2D,
  );
  fetched = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve<unknown>({ ok: true, blob: () => Promise.resolve(new Blob()) }),
  );
  vi.stubGlobal('fetch', fetched);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve(picture)),
  );
});

afterEach(() => {
  forgetBadges();
  paint = () => BLACK;
  picture.width = 200;
  picture.height = 100;
  setBadgeScale(1);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const lettered = () => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
const drewLogo = () => calls.some((c) => c.name === 'drawImage' && c.args[0] === picture);
/** How wide the logo went into the badge (the last drawImage of it). */
const logoWidth = () =>
  calls.filter((c) => c.name === 'drawImage' && c.args[0] === picture).at(-1)?.args[3];

async function drawnSquare() {
  picture.width = 192;
  picture.height = 192;
  const map = fakeMap();
  setOrganizationBadges(map as never, borp());
  addBadge(map as never, 'org-logo-borp');
  await settle();
  return logoWidth();
}

describe("an organization's badge on the map", () => {
  it('shows the short code at once, then the logo when it arrives', async () => {
    const map = fakeMap();
    setOrganizationBadges(map as never, borp());
    addBadge(map as never, 'org-logo-borp');
    expect(map.addImage).toHaveBeenCalledTimes(1);
    expect(lettered()).toEqual(['BORP']);
    expect(drewLogo()).toBe(false);
    await settle();
    expect(fetched).toHaveBeenCalledWith(URL_SIGNED, expect.objectContaining({ mode: 'cors' }));
    expect(drewLogo()).toBe(true);
    expect(map.updateImage).toHaveBeenCalledTimes(1);
    expect(map.updateImage.mock.calls[0]?.[0]).toBe('org-logo-borp');
  });

  it('is the short code, with nothing fetched, for an organization with no logo', async () => {
    const map = fakeMap();
    setOrganizationBadges(map as never, borp({ logoPath: null, logoUrl: null }));
    addBadge(map as never, 'org-logo-borp');
    await settle();
    expect(lettered()).toEqual(['BORP']);
    expect(fetched).not.toHaveBeenCalled();
    expect(map.updateImage).not.toHaveBeenCalled();
  });

  it('keeps the short code when the logo fails, and does not ask for it again', async () => {
    // Storage's refusal still has a body: it must not be drawn.
    fetched.mockImplementation(() =>
      Promise.resolve({ ok: false, blob: () => Promise.resolve(new Blob()) }),
    );
    const map = fakeMap();
    setOrganizationBadges(map as never, borp());
    addBadge(map as never, 'org-logo-borp');
    await settle();
    expect(map.updateImage).not.toHaveBeenCalled();
    // A theme change drops the map's images; MapLibre asks again.
    map.images.clear();
    addBadge(map as never, 'org-logo-borp');
    await settle();
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(map.addImage).toHaveBeenCalledTimes(2);
    expect(drewLogo()).toBe(false);
  });

  it('keeps the short code when the logo is not a picture it can read', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('not a picture'))),
    );
    const map = fakeMap();
    setOrganizationBadges(map as never, borp());
    addBadge(map as never, 'org-logo-borp');
    await settle();
    expect(map.updateImage).not.toHaveBeenCalled();
    expect(lettered()).toEqual(['BORP']);
  });

  it('comes back after a style reload without a second download', async () => {
    const map = fakeMap();
    setOrganizationBadges(map as never, borp());
    addBadge(map as never, 'org-logo-borp');
    await settle();
    const logo = map.images.get('org-logo-borp');
    map.images.clear();
    addBadge(map as never, 'org-logo-borp');
    expect(map.images.get('org-logo-borp')).toBe(logo);
    // And on a map made again (a kept tab shown), the same pixels.
    const again = fakeMap();
    setOrganizationBadges(again as never, borp());
    addBadge(again as never, 'org-logo-borp');
    expect(again.images.get('org-logo-borp')).toBe(logo);
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it('fetches only the logos of organizations the map draws', async () => {
    const map = fakeMap();
    setOrganizationBadges(
      map as never,
      new Map([
        ...borp(),
        ['cil', { shortCode: 'CIL', logoPath: 'organizations/cil/x.webp', logoUrl: 'https://c' }],
      ]),
    );
    await settle();
    expect(fetched).not.toHaveBeenCalled();
    addBadge(map as never, 'org-logo-borp');
    await settle();
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(fetched.mock.calls[0]?.[0]).toBe(URL_SIGNED);
  });

  it('draws the logo once its URL is signed, after the badge was drawn', async () => {
    const map = fakeMap();
    setOrganizationBadges(map as never, borp({ logoUrl: null }));
    addBadge(map as never, 'org-logo-borp');
    await settle();
    expect(fetched).not.toHaveBeenCalled();
    setOrganizationBadges(map as never, borp());
    await settle();
    expect(drewLogo()).toBe(true);
    expect(map.updateImage).toHaveBeenCalledTimes(1);
  });

  it('is drawn sharper at a larger text size', () => {
    setBadgeScale(2.5);
    const map = fakeMap();
    setOrganizationBadges(map as never, borp({ logoPath: null, logoUrl: null }));
    addBadge(map as never, 'org-logo-borp');
    expect(map.addImage).toHaveBeenCalledWith(
      'org-logo-borp',
      expect.objectContaining({ width: 32 * 3 }),
      { pixelRatio: 3 },
    );
  });

  // The owner, 2026-10-28: SCI-FIT's round logo was a small circle in a white ring.
  it('lets a round logo fill the disc', async () => {
    paint = circle;
    expect(await drawnSquare()).toBe(25.5);
  });

  it('keeps a square logo whole inside the disc', async () => {
    expect(await drawnSquare()).toBeCloseTo(24 / Math.SQRT2);
  });

  it('ignores images that are not badges', () => {
    const map = fakeMap();
    addBadge(map as never, 'club-peer');
    expect(map.addImage).not.toHaveBeenCalled();
  });
});
