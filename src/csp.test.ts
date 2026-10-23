import { describe, expect, it } from 'vitest';
import { appYoutubeEmbedUrl } from '@/lib/chat/link-preview';
import SHELL from '../index.html?raw';
import { APP_FRAMES, nativeCsp, webCsp } from '../native-csp';
import NETLIFY from '../netlify.toml?raw';

/**
 * The Content-Security-Policy in netlify.toml lets index.html's inline scripts
 * run by their hashes. Edit a script and its hash changes; in production the
 * script then stops running (the move off thesciclub.netlify.app, or dark mode
 * before first paint) with nothing but a console line to say so. This says it
 * here instead, with the value to paste.
 */

const policy = /^\s*Content-Security-Policy = "([^"]+)"$/m.exec(NETLIFY)?.[1] ?? '';

function directive(name: string): string[] {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  return found?.slice(1) ?? [];
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
}

const inline = [...SHELL.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '');

describe('the Content-Security-Policy', () => {
  it('is in netlify.toml', () => {
    expect(policy).not.toBe('');
  });

  it("allows each of index.html's inline scripts by its hash", async () => {
    expect(inline.length).toBeGreaterThan(0);
    const allowed = directive('script-src');
    for (const script of inline) {
      const hash = await sha256(script);
      expect(allowed, `index.html's script starting "${script.trim().slice(0, 40)}"`).toContain(
        hash,
      );
    }
  });

  it('allows no script hash that index.html no longer has', async () => {
    const current = await Promise.all(inline.map(sha256));
    const listed = directive('script-src').filter((source) => source.startsWith("'sha256-"));
    expect(listed.sort()).toEqual(current.sort());
  });

  it('never allows inline script or eval wholesale', () => {
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  // Inline styles are allowed for Google's button. Their reach is what img-src
  // and font-src allow, so those must stay the club's own and Supabase.
  it('lets an inline style load nothing from anywhere new', () => {
    expect(directive('img-src')).toEqual([
      "'self'",
      'blob:',
      'https://erijdvqnxavwezsbbojv.supabase.co',
    ]);
    expect(directive('font-src')).toEqual(["'self'"]);
  });

  // Only to copy a member's Google photo when they choose it (2026-10-22).
  it("fetches from Google's photo host and no other of Google's", () => {
    const google = directive('connect-src').filter((s) => s.includes('google'));
    expect(google).toEqual([
      'https://lh3.googleusercontent.com',
      'https://accounts.google.com/gsi/',
    ]);
  });

  // A video plays from YouTube's privacy-enhanced host; nothing else may be
  // framed inside the club, Instagram included (the owner, 2026-10-06).
  it("frames only YouTube's privacy-enhanced player and Google's sign-in", () => {
    expect(directive('frame-src')).toEqual([
      'https://www.youtube-nocookie.com',
      'https://accounts.google.com/gsi/',
    ]);
  });

  // One file from Google, not the whole of accounts.google.com.
  it("loads Google's sign-in script and no other script from elsewhere", () => {
    expect(directive('script-src').filter((s) => s.startsWith('https:'))).toEqual([
      'https://accounts.google.com/gsi/client',
    ]);
  });

  it('still lets no other site frame the club', () => {
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
  });
});

/**
 * The store app's policy (native-csp.ts), written into its index.html: the
 * website's, less what the app does not load and what a <meta> ignores.
 */
describe("the store app's Content-Security-Policy", () => {
  const app = nativeCsp(webCsp(NETLIFY));

  function appDirective(name: string): string[] {
    const found = app
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .find(([key]) => key === name);
    return found?.slice(1) ?? [];
  }

  it("allows index.html's inline scripts by the same hashes, and nothing wholesale", async () => {
    const allowed = appDirective('script-src');
    for (const script of inline) expect(allowed).toContain(await sha256(script));
    expect(allowed).not.toContain("'unsafe-inline'");
    expect(app).not.toContain("'unsafe-eval'");
  });

  it('names the app’s own capacitor://localhost beside every self', () => {
    for (const name of ['default-src', 'script-src', 'connect-src', 'img-src', 'font-src']) {
      expect(appDirective(name)).toEqual(
        expect.arrayContaining(["'self'", 'capacitor://localhost']),
      );
    }
  });

  it('reaches Supabase, the geocoder and Google photos, and nothing else of Google', () => {
    expect(appDirective('connect-src')).toEqual([
      "'self'",
      'capacitor://localhost',
      'https://erijdvqnxavwezsbbojv.supabase.co',
      'wss://erijdvqnxavwezsbbojv.supabase.co',
      'https://nominatim.openstreetmap.org',
      'https://lh3.googleusercontent.com',
    ]);
    expect(app).not.toContain('google.com');
    expect(appDirective('object-src')).toEqual(["'none'"]);
  });

  // YouTube refuses capacitor://localhost, so the app frames the club's
  // player page, which frames YouTube. Nothing else, Google's sign-in included.
  it("frames only the club's YouTube player page", () => {
    expect(appDirective('frame-src')).toEqual(['https://thesciclub.com/embed/']);
    expect(appYoutubeEmbedUrl('dQw4w9WgXcQ').startsWith(APP_FRAMES)).toBe(true);
    expect(app).not.toContain('youtube');
  });

  it('leaves out what a <meta> ignores or the app has not', () => {
    expect(appDirective('frame-ancestors')).toEqual([]);
    expect(appDirective('worker-src')).toEqual([]);
    expect(appDirective('manifest-src')).toEqual([]);
  });
});
