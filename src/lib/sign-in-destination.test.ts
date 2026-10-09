import { describe, expect, it } from 'vitest';
import { signInDestination, signInDoor } from '@/lib/sign-in-destination';

describe('shared links through sign-in', () => {
  it('preserves path, query and fragment through the sign-in door', () => {
    const destination = '/chat/t/thread?reply=post#message';
    expect(signInDestination(signInDoor(destination).split('?').slice(1).join('?'))).toBe(
      destination,
    );
  });
  it.each([
    'https://elsewhere.example',
    '//elsewhere.example',
    '/\\elsewhere.example',
    '/join',
    '/chat/../join',
    '\n/home',
  ])('refuses an unsafe or looping return address %s', (next) => {
    expect(signInDestination(new URLSearchParams({ next }).toString())).toBe('/home');
  });
  it('defaults an ordinary sign-in to Home', () => {
    expect(signInDestination('')).toBe('/home');
  });
});
