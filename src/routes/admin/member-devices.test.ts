import { describe, expect, it } from 'vitest';
import {
  byReach,
  type MemberDevice,
  type MemberDevices,
  reachOf,
  systemCounts,
} from '@/routes/admin/member-devices';

const device = (surface: MemberDevice['surface'], os: string | null): MemberDevice => ({
  surface,
  os,
  browser: null,
  browserVersion: null,
  screenWidth: null,
  screenHeight: null,
  pixelRatio: null,
  colorScheme: null,
  notifications: null,
  seenAt: '2026-11-02T19:00:00Z',
});

const member = (id: string, ...devices: MemberDevice[]): MemberDevices => ({
  id,
  name: id,
  username: null,
  notifiedDevices: 0,
  devices,
});

describe('how a member reaches the club', () => {
  it('says who could add it to a Home Screen', () => {
    expect(reachOf(member('a', device('browser', 'iOS')))).toBe('phone_browser');
    expect(reachOf(member('a', device('browser', 'Android')))).toBe('phone_browser');
  });

  it('does not prompt somebody installed on the phone they also browse on', () => {
    const both = member('a', device('browser', 'iOS'), device('home_screen', 'iOS'));
    expect(reachOf(both)).toBe('home_screen');
    expect(reachOf(member('a', device('browser', 'iOS'), device('app', 'iOS')))).toBe('app');
  });

  it('still prompts a phone when only a computer has it installed', () => {
    const mac = member('a', device('home_screen', 'macOS'), device('browser', 'iOS'));
    expect(reachOf(mac)).toBe('phone_browser');
    expect(reachOf(member('a', device('home_screen', 'macOS')))).toBe('home_screen');
  });

  it('tells a computer from nobody seen', () => {
    expect(reachOf(member('a', device('browser', 'Windows')))).toBe('computer');
    expect(reachOf(member('a'))).toBe('unseen');
  });

  it('puts the people to help first, and nobody seen last', () => {
    const list = [
      member('unseen'),
      member('installed', device('home_screen', 'iOS')),
      member('phone', device('browser', 'iOS')),
    ];
    expect(byReach(list).map((m) => m.id)).toEqual(['phone', 'installed', 'unseen']);
  });

  it('counts a member on each system they use', () => {
    expect(
      systemCounts([
        member('a', device('browser', 'iOS'), device('browser', 'macOS')),
        member('b', device('browser', 'Android')),
      ]),
    ).toEqual({ ios: 1, android: 1, computer: 1 });
  });
});
