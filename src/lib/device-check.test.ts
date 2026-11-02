import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserOf, osOf, startDeviceCheck } from '@/lib/device-check';

const db = vi.hoisted(() => ({
  rpc: vi.fn(() => Promise.resolve({ data: true, error: null })),
  session: null as { user: { id: string } } | null,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: db.rpc,
    auth: { getSession: () => Promise.resolve({ data: { session: db.session } }) },
  }),
}));

const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('what a browser says about itself', () => {
  it('names the browser and its major version', () => {
    expect(browserOf(IPHONE_CHROME)).toEqual({ name: 'Chrome', version: '131' });
    expect(browserOf(IPHONE_SAFARI)).toEqual({ name: 'Safari', version: '18.1' });
    expect(browserOf(WINDOWS_EDGE)).toEqual({ name: 'Edge', version: '131' });
    expect(browserOf(MAC_CHROME)).toEqual({ name: 'Chrome', version: '130' });
    expect(browserOf('something else')).toEqual({ name: null, version: null });
  });

  it('names the system, and an iPad asking for the desktop site', () => {
    expect(osOf(IPHONE_CHROME)).toBe('iOS');
    expect(osOf(WINDOWS_EDGE)).toBe('Windows');
    expect(osOf(MAC_CHROME)).toBe('macOS');
    expect(osOf(MAC_CHROME, 5)).toBe('iPadOS');
  });
});

describe('noting it', () => {
  let stop: () => void = () => undefined;

  beforeEach(() => {
    localStorage.clear();
    db.rpc.mockClear();
    db.session = { user: { id: 'me' } };
  });

  afterEach(() => {
    stop();
  });

  const press = () => {
    window.dispatchEvent(new Event('pointerdown'));
  };
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('waits for an action, and sends the parts, never the browser’s whole string', async () => {
    stop = startDeviceCheck();
    expect(db.rpc).not.toHaveBeenCalled();
    press();
    await settled();
    expect(db.rpc).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(db.rpc.mock.calls[0]);
    expect(sent).toContain('p_surface');
    expect(sent).not.toContain(navigator.userAgent);
    expect(sent).toContain('p_notifications');
  });

  it('notes once in a day, however many presses', async () => {
    stop = startDeviceCheck();
    press();
    await settled();
    press();
    await settled();
    stop();
    stop = startDeviceCheck();
    press();
    await settled();
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('notes again the next day', async () => {
    let at = 1_000_000_000;
    stop = startDeviceCheck(() => at);
    press();
    await settled();
    stop();
    at += 25 * 60 * 60 * 1000;
    stop = startDeviceCheck(() => at);
    press();
    await settled();
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });

  it('keeps listening until somebody is signed in', async () => {
    db.session = null;
    stop = startDeviceCheck();
    press();
    await settled();
    expect(db.rpc).not.toHaveBeenCalled();
    db.session = { user: { id: 'me' } };
    press();
    await settled();
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
});
