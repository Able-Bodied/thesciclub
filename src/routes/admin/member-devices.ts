import { useCallback, useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * What each member uses to reach the club, for Admin → Stats (20261102000000).
 *
 * This names people (the owner, 2026-11-02), so somebody still in a phone's
 * browser can be helped onto the Home Screen. Each device notes itself once a
 * day (src/lib/device-check.ts).
 */

export interface MemberDevice {
  surface: 'browser' | 'home_screen' | 'app';
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  pixelRatio: number | null;
  colorScheme: 'light' | 'dark' | null;
  notifications: 'allowed' | 'refused' | 'not_asked' | null;
  seenAt: string;
}

export interface MemberDevices {
  id: string;
  name: string | null;
  username: string | null;
  /** Devices the club can notify now, which is more than a permission. */
  notifiedDevices: number;
  /** The latest for each way they have come, newest first. */
  devices: MemberDevice[];
}

export interface DeviceReport {
  asOf: string;
  /** The oldest row kept, or null before the first. */
  recordedSince: string | null;
  members: MemberDevices[];
}

/** How a member reaches the club, the one to help first at the top. */
export const REACHES = ['phone_browser', 'home_screen', 'app', 'computer', 'unseen'] as const;
export type Reach = (typeof REACHES)[number];

const HANDHELD = ['iOS', 'iPadOS', 'Android'];

const onHandheld = (device: MemberDevice) => device.os !== null && HANDHELD.includes(device.os);

/** Installed on one phone is enough: a browser elsewhere is not a member to prompt. */
export function reachOf(member: MemberDevices): Reach {
  const { devices } = member;
  if (!devices.length) return 'unseen';
  if (devices.some((d) => d.surface === 'app')) return 'app';
  if (devices.some((d) => d.surface === 'home_screen' && onHandheld(d))) return 'home_screen';
  if (devices.some(onHandheld)) return 'phone_browser';
  return devices.some((d) => d.surface === 'home_screen') ? 'home_screen' : 'computer';
}

export function byReach(members: MemberDevices[]): MemberDevices[] {
  return [...members].sort((a, b) => REACHES.indexOf(reachOf(a)) - REACHES.indexOf(reachOf(b)));
}

/** Members seen on each: somebody with a phone and a computer counts in both. */
export function systemCounts(members: MemberDevices[]) {
  const has = (test: (os: string | null) => boolean) =>
    members.filter((m) => m.devices.some((d) => test(d.os))).length;
  return {
    ios: has((os) => os === 'iOS' || os === 'iPadOS'),
    android: has((os) => os === 'Android'),
    computer: has((os) => os === null || !HANDHELD.includes(os)),
  };
}

export async function fetchDeviceReport(): Promise<
  { ok: true; report: DeviceReport } | { ok: false; error: string }
> {
  const refusal = 'Could not load members’ devices.';
  const { data, error } = (await getSupabase().rpc('admin_member_devices')) as {
    data: DeviceReport | null;
    error: Parameters<typeof describeError>[0] | null;
  };
  if (error || !data) return { ok: false, error: error ? describeError(error, refusal) : refusal };
  return { ok: true, report: data };
}

export function useDeviceReport() {
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchDeviceReport();
    if (result.ok) {
      setReport(result.report);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { report, error, reload: load };
}
