import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { publicEventUrl } from '@/lib/event-audience';
import { ShortLinkField, ShortLinkQr } from '@/routes/events/event-short-link';

const api = vi.hoisted(() => ({
  saved: [] as string[],
  result: null as { ok: boolean; value?: string | null; error?: string } | null,
}));

vi.mock('@/lib/event-audience', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setEventShortLink: (_id: string, link: string) => {
    api.saved.push(link);
    return Promise.resolve(api.result ?? { ok: true, value: link || null });
  },
}));

function field(shortLink: string | null = null) {
  const onSaved = vi.fn();
  render(<ShortLinkField eventId="e1" shortLink={shortLink} onSaved={onSaved} say={vi.fn()} />);
  return { onSaved, input: screen.getByLabelText('Short link') };
}

describe('an event’s short link', () => {
  it('is the address once it has one', () => {
    expect(publicEventUrl('e1')).toBe('https://thesciclub.com/e/e1');
    expect(publicEventUrl('e1', '49ers')).toBe('https://thesciclub.com/e/49ers');
  });

  it('tidies what is typed as an address, and saves it', async () => {
    api.saved = [];
    api.result = null;
    const { input, onSaved } = field();
    await userEvent.type(input, 'Niners Game!');
    expect(input).toHaveValue('niners-game');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saved).toEqual(['niners-game']);
    expect(onSaved).toHaveBeenCalledWith('niners-game');
  });

  it('refuses a link that could not be saved, without asking', async () => {
    api.saved = [];
    const { input } = field();
    await userEvent.type(input, 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/2 to 32 letters/);
    expect(api.saved).toEqual([]);
  });

  it('says when it is taken', async () => {
    api.result = { ok: false, error: 'That short link is taken. Try another.' };
    const { input, onSaved } = field();
    await userEvent.type(input, '49ers');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/taken/);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('takes it off when cleared', async () => {
    api.saved = [];
    api.result = null;
    const { input, onSaved } = field('49ers');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saved).toEqual(['']);
    expect(onSaved).toHaveBeenCalledWith(null);
  });

  it('becomes a QR code on request', async () => {
    render(<ShortLinkQr link="https://thesciclub.com/e/49ers" title="49ers game" />);
    expect(screen.queryByRole('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Make a QR code' }));
    expect(screen.getByRole('img', { name: 'QR code for 49ers game' })).toBeInTheDocument();
  });
});
