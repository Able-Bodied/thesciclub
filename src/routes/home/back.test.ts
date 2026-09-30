import { describe, expect, it } from 'vitest';
import { backToHome } from '@/routes/home/back';

describe('backToHome', () => {
  it('returns to the pill the screen was opened from', () => {
    expect(backToHome({ from: 'home', segment: 'events' })).toBe('/home?segment=events');
    expect(backToHome({ from: 'home', segment: 'photos' })).toBe('/home?segment=photos');
  });

  it('leaves the URL clean for Everything', () => {
    expect(backToHome({ from: 'home', segment: 'everything' })).toBe('/home');
  });

  it('goes to Home when the pill is missing or not one of Home’s', () => {
    expect(backToHome({ from: 'home' })).toBe('/home');
    expect(backToHome({ from: 'home', segment: 'orgs' })).toBe('/home');
    expect(backToHome({ from: 'home', segment: 42 })).toBe('/home');
  });

  it('says nothing for a screen that was not opened from Home', () => {
    expect(backToHome(null)).toBeNull();
    expect(backToHome(undefined)).toBeNull();
    expect(backToHome({ segment: 'orgs' })).toBeNull();
    expect(backToHome({ from: 'me' })).toBeNull();
  });
});
