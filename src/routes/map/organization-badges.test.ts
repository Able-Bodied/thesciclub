import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  addBadge,
  type BadgeSource,
  forgetBadges,
  setBadgeScale,
  setOrganizationBadges,
} from '@/routes/map/organization-badges';

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
      data: new Uint8ClampedArray(4),
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
  setBadgeScale(1);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const lettered = () => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
const drewLogo = () => calls.some((c) => c.name === 'drawImage' && c.args[0] === picture);

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

  it('ignores images that are not badges', () => {
    const map = fakeMap();
    addBadge(map as never, 'club-peer');
    expect(map.addImage).not.toHaveBeenCalled();
  });
});
