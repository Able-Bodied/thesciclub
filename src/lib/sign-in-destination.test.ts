import { beforeEach, describe, expect, it } from 'vitest';
import {
  arrivalDestination,
  forgetDestination,
  heldDestination,
  holdDestination,
  signInDestination,
  signInDoor,
} from '@/lib/sign-in-destination';

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

// The owner, 2026-10-28: a shared link survives asking for an invite.
describe('a destination kept on this device', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is used when the address carries none, until it is reached', () => {
    holdDestination('/chat/rooms/general/topics/t1?post=p1');
    expect(arrivalDestination('?invite=abc')).toBe('/chat/rooms/general/topics/t1?post=p1');
    expect(arrivalDestination('?next=%2Fevents%2Fe1')).toBe('/events/e1');
    forgetDestination();
    expect(arrivalDestination('?invite=abc')).toBe('/home');
  });

  it('keeps nothing unsafe, and forgets one a month old', () => {
    holdDestination('https://elsewhere.example/steal');
    expect(heldDestination()).toBeNull();
    holdDestination('/chat/rooms/general/topics/t1');
    expect(heldDestination(Date.now() + 31 * 86_400_000)).toBeNull();
  });
});
