import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithOtp: () => Promise.resolve({ error: null }),
      verifyOtp: () => Promise.resolve({ error: null }),
    },
  }),
}));

const { default: DevLoginPage } = await import('@/routes/dev-login/page');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dev-login" element={<DevLoginPage />} />
        <Route path="/home" element={<h1>Home</h1>} />
        <Route path="/events" element={<h1>Events</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DevLoginPage', () => {
  it('lands where the app opens when no next is given', async () => {
    renderAt('/dev-login?phone=11111111111&code=111111');
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('goes to next when one is given', async () => {
    renderAt('/dev-login?phone=11111111111&code=111111&next=/events');
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
  });
});
