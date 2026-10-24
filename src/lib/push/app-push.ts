import type { PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * The store app's side of notifications on an iPhone: the system's permission
 * and the APNs device token. notifications.ts decides what to do with them;
 * this only asks iOS. Loaded only in the app, so the website never downloads
 * the plugin.
 *
 * The token goes to the club as `apns:<environment>:<token>`
 * (20261023030000). TestFlight and App Store builds get production tokens; a
 * development build from Xcode gets sandbox ones and must be built with
 * VITE_APNS_ENVIRONMENT=sandbox.
 */

export type AppPermission = 'granted' | 'denied' | 'default';

/** The plugin's answer in the web's words: `prompt` is not asked yet. */
export function toPermission(receive: string): AppPermission {
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  return 'default';
}

export function apnsEnvironment(): 'production' | 'sandbox' {
  return import.meta.env.VITE_APNS_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
}

/** The endpoint the club keeps for this iPhone. */
export function appEndpoint(token: string): string {
  return `apns:${apnsEnvironment()}:${token.toLowerCase()}`;
}

export async function appPermission(): Promise<AppPermission> {
  return toPermission((await PushNotifications.checkPermissions()).receive);
}

/** The system's prompt; iOS shows it once, and after that answers by itself. */
export async function askAppPermission(): Promise<AppPermission> {
  return toPermission((await PushNotifications.requestPermissions()).receive);
}

const TOKEN_WAIT_MS = 15_000;
let token: Promise<string> | null = null;

/**
 * This iPhone's token, asked of iOS once per launch. iOS answers through an
 * event, so the listeners go on before `register()`. A failure is not kept:
 * the next call asks again.
 */
export function appToken(): Promise<string> {
  token ??= new Promise<string>((resolve, reject) => {
    const handles: Promise<PluginListenerHandle>[] = [];
    const finish = (error: Error | null, value?: string) => {
      clearTimeout(timer);
      for (const handle of handles) void handle.then((h) => h.remove()).catch(() => undefined);
      if (error || !value) reject(error ?? new Error('No device token'));
      else resolve(value);
    };
    const timer = setTimeout(() => {
      finish(new Error('Apple did not answer with a device token'));
    }, TOKEN_WAIT_MS);
    handles.push(
      PushNotifications.addListener('registration', ({ value }) => {
        finish(null, value);
      }),
      PushNotifications.addListener('registrationError', ({ error }) => {
        finish(new Error(error));
      }),
    );
    Promise.all(handles)
      .then(() => PushNotifications.register())
      .catch((e: unknown) => {
        finish(e instanceof Error ? e : new Error(String(e)));
      });
  }).catch((e: unknown) => {
    token = null;
    throw e;
  });
  return token;
}
