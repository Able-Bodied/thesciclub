import { describe, expect, it } from 'vitest';
import { isOlder, updateRequired } from '@/lib/app-update';

describe('the iPhone app update check', () => {
  it('compares versions as numbers, part by part', () => {
    expect(isOlder('1.2.9', '1.2.10')).toBe(true);
    expect(isOlder('1.10.0', '1.9.0')).toBe(false);
    expect(isOlder('1.3', '1.3.0')).toBe(false);
    expect(isOlder('1.3.0', '1.3.0')).toBe(false);
    expect(isOlder('0.9.9', '1.0.0')).toBe(true);
  });

  it('asks for an update only when the oldest working version is above this one, and lets the app open when it cannot tell', async () => {
    const version = () => Promise.resolve('1.2.0');
    expect(await updateRequired({ version, oldest: () => Promise.resolve('1.3.0') })).toBe(true);
    expect(await updateRequired({ version, oldest: () => Promise.resolve('1.2.0') })).toBe(false);
    expect(await updateRequired({ version, oldest: () => Promise.resolve(null) })).toBe(false);
    expect(
      await updateRequired({ version, oldest: () => Promise.reject(new Error('offline')) }),
    ).toBe(false);
  });
});
