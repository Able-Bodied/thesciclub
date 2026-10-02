import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider, useAnnounce } from '@/lib/announce';

function Speaker({ words }: { words: string }) {
  const announce = useAnnounce();
  return (
    <button
      type="button"
      onClick={() => {
        announce(words);
      }}
    >
      Speak
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('announcing', () => {
  it('says the words in a polite status region', () => {
    render(
      <AnnounceProvider>
        <Speaker words="Saved." />
      </AnnounceProvider>,
    );
    act(() => {
      screen.getByRole('button').click();
      vi.advanceTimersByTime(100);
    });
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Saved.');
  });

  // The same words twice are heard twice: the region empties first.
  it('empties the region before saying the same words again', () => {
    render(
      <AnnounceProvider>
        <Speaker words="Liked." />
      </AnnounceProvider>,
    );
    act(() => {
      screen.getByRole('button').click();
      vi.advanceTimersByTime(100);
    });
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Liked.');
  });

  it('clears itself a few seconds later', () => {
    render(
      <AnnounceProvider>
        <Speaker words="Saved." />
      </AnnounceProvider>,
    );
    act(() => {
      screen.getByRole('button').click();
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('does nothing, and does not throw, outside a provider', () => {
    render(<Speaker words="Saved." />);
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
