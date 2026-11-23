import { expect, it } from 'vitest';
import { type PlatformSpeedRow, releaseChange } from './release-platform-speed';

it('compares like timings only when both releases have enough samples', () => {
  const previous: PlatformSpeedRow = {
    platform: 'ios-app',
    release: '2026-11-22T01:00',
    metric: 'first-paint',
    samples: 5,
    p50_ms: 800,
    p90_ms: 1400,
  };
  const current: PlatformSpeedRow = {
    ...previous,
    release: '2026-11-23T01:00',
    p50_ms: 700,
    p90_ms: 1500,
  };

  expect(releaseChange(current, previous, 'p50_ms')).toBe(-100);
  expect(releaseChange(current, previous, 'p90_ms')).toBe(100);
  expect(releaseChange(current, { ...previous, samples: 4 }, 'p50_ms')).toBeNull();
  expect(releaseChange(current, { ...previous, platform: 'home-screen' }, 'p50_ms')).toBeNull();
  expect(releaseChange(current, { ...previous, metric: 'cards-after-tap' }, 'p50_ms')).toBeNull();
});
