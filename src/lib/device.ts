/**
 * Whether a view happened on a phone or tablet, or on a computer, for
 * administrators' list of who viewed a post (20261022030000).
 *
 * The browser's own answer where it gives one (Chrome, Edge); otherwise the
 * user agent. iPadOS asks for the desktop site, so a Mac with a touch screen
 * is taken to be an iPad.
 */
export type ViewDevice = 'mobile' | 'desktop';

export function viewDevice(): ViewDevice {
  const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    ?.mobile;
  if (typeof hint === 'boolean') return hint ? 'mobile' : 'desktop';
  const agent = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(agent)) return 'mobile';
  if (agent.includes('Macintosh') && navigator.maxTouchPoints > 1) return 'mobile';
  return 'desktop';
}

/**
 * PostgREST's answer when no function has the arguments sent: the database
 * is older than the app, so the caller retries without the device.
 */
export function missingFunction(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202';
}
