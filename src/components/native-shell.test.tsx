import { Capacitor } from '@capacitor/core';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeShell } from '@/components/native-shell';

const started = vi.hoisted(() => vi.fn(() => () => undefined));
vi.mock('@/lib/native-shell', () => ({ startNativeShell: started }));

afterEach(() => {
  started.mockClear();
  vi.restoreAllMocks();
});

function renderShell() {
  render(
    <MemoryRouter>
      <NativeShell />
    </MemoryRouter>,
  );
}

describe('NativeShell', () => {
  it('starts nothing on the website', async () => {
    renderShell();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).not.toHaveBeenCalled();
  });

  it('starts the native pieces in the store app', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    renderShell();
    await waitFor(() => {
      expect(started).toHaveBeenCalledTimes(1);
    });
  });
});
