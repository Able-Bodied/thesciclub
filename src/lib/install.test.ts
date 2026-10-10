import { afterEach, describe, expect, it } from 'vitest';
import { installPlatform, NUDGE_SNOOZE_DAYS, nudgeSnoozed, snoozeNudge } from '@/lib/install';

const UA = {
  safari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
  firefoxIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  edgeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/129.0 Mobile/15E148 Safari/605.1.15',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};

describe('which steps a browser gets', () => {
  it('tells the iPhone browsers apart, since each reaches Share differently', () => {
    expect(installPlatform(UA.safari)).toBe('ios-safari');
    expect(installPlatform(UA.chromeIos)).toBe('ios-chrome');
    expect(installPlatform(UA.firefoxIos)).toBe('ios-firefox');
    expect(installPlatform(UA.edgeIos)).toBe('ios-edge');
  });

  it('sends an app’s own browser to a real one first', () => {
    expect(installPlatform(UA.instagram)).toBe('in-app');
  });

  it('knows an iPad asking for the desktop site by its touch screen', () => {
    expect(installPlatform(UA.ipadDesktopMode, 5)).toBe('ios-safari');
    expect(installPlatform(UA.ipadDesktopMode, 0)).toBe('desktop');
  });

  it('knows Android and a computer', () => {
    expect(installPlatform(UA.android)).toBe('android');
    expect(installPlatform(UA.desktop)).toBe('desktop');
  });
});

describe('not now', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it(`lasts ${NUDGE_SNOOZE_DAYS} days, then asks again`, () => {
    const now = Date.UTC(2026, 9, 10);
    expect(nudgeSnoozed(now)).toBe(false);
    snoozeNudge(now);
    expect(nudgeSnoozed(now + (NUDGE_SNOOZE_DAYS - 1) * 86_400_000)).toBe(true);
    expect(nudgeSnoozed(now + (NUDGE_SNOOZE_DAYS + 1) * 86_400_000)).toBe(false);
  });
});
