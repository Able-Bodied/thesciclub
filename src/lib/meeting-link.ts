/**
 * Whether an event's link is a call to join rather than a page to read, and
 * which service it is (the owner, 2026-10-23: "Join online" for a meeting
 * link, "Details on their site" for the rest). Hosts are matched whole, so
 * `zoom.us.evil.com` is not Zoom. The calendar importer keeps its own shorter
 * list (calendar-inbound/place.ts); every host there must be here.
 */

const SERVICES: readonly { name: string; hosts: readonly string[] }[] = [
  { name: 'Google Meet', hosts: ['meet.google.com'] },
  { name: 'Zoom', hosts: ['zoom.us', 'zoom.com', 'zoomgov.com'] },
  { name: 'Microsoft Teams', hosts: ['teams.microsoft.com', 'teams.live.com'] },
  { name: 'Webex', hosts: ['webex.com'] },
  { name: 'Whereby', hosts: ['whereby.com'] },
  { name: 'Jitsi Meet', hosts: ['meet.jit.si'] },
];

/** The service's name for a meeting link, or null for any other address. */
export function meetingService(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
  for (const service of SERVICES) {
    if (service.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return service.name;
  }
  return null;
}

export function isMeetingLink(url: string | null | undefined): boolean {
  return meetingService(url) !== null;
}
