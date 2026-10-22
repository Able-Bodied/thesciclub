import { Capacitor } from '@capacitor/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthConfirmPage from '@/routes/auth-confirm/page';

const replace = vi.fn();
const send = vi.fn<typeof fetch>();
let token = 0;

/** The page reads the address it opened at; replace() is how it leaves. */
function at(search: string) {
  // Only what the page reads.
  vi.stubGlobal('location', {
    origin: window.location.origin,
    search,
    replace,
  });
  render(
    <MemoryRouter>
      <AuthConfirmPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  token += 1;
  vi.stubGlobal('fetch', send);
});

afterEach(() => {
  vi.unstubAllGlobals();
  send.mockReset();
  replace.mockReset();
  sessionStorage.clear();
});

describe('AuthConfirmPage', () => {
  it('spends the link and loads the page it was for', async () => {
    send.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 })),
    );
    at(`?type=recovery&token_hash=t${token}`);
    expect(screen.getByRole('heading', { name: 'One moment' })).toBeInTheDocument();
    await waitFor(() => {
      expect(replace).toHaveBeenCalledTimes(1);
    });
    expect(String(replace.mock.calls[0]?.[0])).toMatch(/^\/reset-password#access_token=at&/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('offers another try when the connection drops, and the try works', async () => {
    send.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    send.mockResolvedValueOnce(
      new Response(JSON.stringify({ error_code: 'otp_expired' }), { status: 403 }),
    );
    at(`?type=email&token_hash=t${token}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(replace).toHaveBeenCalledTimes(1);
    });
    expect(String(replace.mock.calls[0]?.[0])).toMatch(/^\/join\?confirmed=1#error=access_denied/);
  });

  it('in the store app, keeps a thesciclub.com destination rather than the default', async () => {
    const native = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    send.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 })),
    );
    const next = encodeURIComponent('https://thesciclub.com/chat/t/shared');
    vi.stubGlobal('location', {
      origin: 'capacitor://localhost',
      search: `?type=email&token_hash=t${token}&next=${next}`,
      replace,
    });
    render(
      <MemoryRouter>
        <AuthConfirmPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(replace).toHaveBeenCalledTimes(1);
    });
    expect(String(replace.mock.calls[0]?.[0])).toMatch(/^\/chat\/t\/shared#access_token=at&/);
    native.mockRestore();
  });

  it('says a link without its token is not complete, and spends nothing', () => {
    at('?type=email');
    expect(screen.getByRole('heading', { name: 'This link is not complete' })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });
});
