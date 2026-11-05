import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  endpointOf,
  flush,
  resetPageSpeed,
  screenOf,
  startPageSpeed,
  timedFetch,
} from '@/lib/page-speed';

const BASE = 'https://project.supabase.co';

afterEach(() => {
  resetPageSpeed();
});

describe('a screen, as its pattern', () => {
  it('never says which event, person or chat', () => {
    expect(screenOf('/events/836de9c7-9b0e-4931-bd07-1aa6901ebbbf')).toBe('/events/:id');
    expect(screenOf('/events/836de9c7/guests')).toBe('/events/:id/guests');
    expect(screenOf('/peers/dana-ruiz')).toBe('/peers/:id');
    expect(screenOf('/chat/rooms/r1/topics/t9')).toBe('/chat/rooms/:id/topics/:id');
  });

  it('keeps the screens that have a name of their own', () => {
    expect(screenOf('/events/new')).toBe('/events/new');
    expect(screenOf('/chat/rooms/new')).toBe('/chat/rooms/new');
    expect(screenOf('/home')).toBe('/home');
  });

  it('calls anything else other, rather than keeping the address', () => {
    expect(screenOf('/somebody/typed/this')).toBe('/other');
  });
});

describe('what a request asked for', () => {
  it('names it without its arguments', () => {
    expect(endpointOf(`${BASE}/rest/v1/rpc/map_events?x=1`)).toBe('rpc:map_events');
    expect(endpointOf(`${BASE}/rest/v1/members?select=id&email=eq.dana@example.com`)).toBe(
      'table:members',
    );
    expect(endpointOf(`${BASE}/auth/v1/token?grant_type=refresh_token`)).toBe('auth:token');
    expect(endpointOf(`${BASE}/functions/v1/send-invite`)).toBe('fn:send-invite');
    expect(endpointOf(`${BASE}/storage/v1/object/avatars/me.jpg`)).toBe('storage');
  });

  it('ignores what is not the club', () => {
    expect(endpointOf('https://example.com/x')).toBeNull();
    expect(endpointOf('not a url')).toBeNull();
  });
});

describe('timing requests', () => {
  it('times each request and sends them in a batch', async () => {
    const sent: unknown[][] = [];
    startPageSpeed((samples) => {
      sent.push(samples);
      return Promise.resolve();
    });
    const base = vi.fn(() => Promise.resolve(new Response('[]', { status: 200 })));
    const fetcher = timedFetch(base);
    await fetcher(`${BASE}/rest/v1/rpc/map_events`, {});
    await fetcher(`${BASE}/rest/v1/rpc/events_within_miles`, {});
    flush();
    expect(base).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([
      expect.objectContaining({ kind: 'request', metric: 'rpc:map_events', ok: true }),
      expect.objectContaining({ kind: 'request', metric: 'rpc:events_within_miles' }),
    ]);
  });

  it('says a request failed, and still lets the error through', async () => {
    const sent: { ok: boolean }[][] = [];
    startPageSpeed((samples) => {
      sent.push(samples);
      return Promise.resolve();
    });
    const fetcher = timedFetch(() => Promise.reject(new Error('offline')));
    await expect(fetcher(`${BASE}/rest/v1/members`, {})).rejects.toThrow('offline');
    flush();
    expect(sent[0]?.[0]?.ok).toBe(false);
  });

  it('does not time its own log call', async () => {
    const sent: unknown[][] = [];
    startPageSpeed((samples) => {
      sent.push(samples);
      return Promise.resolve();
    });
    const fetcher = timedFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    await fetcher(`${BASE}/rest/v1/rpc/log_page_speed`, {});
    flush();
    expect(sent).toEqual([]);
  });

  it('never throws when sending fails', async () => {
    startPageSpeed(() => {
      throw new Error('not configured');
    });
    const fetcher = timedFetch(() => Promise.resolve(new Response('', { status: 200 })));
    await fetcher(`${BASE}/rest/v1/members`, {});
    expect(() => {
      flush();
    }).not.toThrow();
  });
});
