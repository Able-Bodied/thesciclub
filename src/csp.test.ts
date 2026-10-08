import { describe, expect, it } from 'vitest';
import SHELL from '../index.html?raw';
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
