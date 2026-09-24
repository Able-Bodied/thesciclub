import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RouteChange } from '@/App';

/**
 * Two screens with a heading each and a link between them — the shape of
 * the app, without the app. What is under test is what a page load does on
 * its own and a route change does not: the title and where focus lands.
 */
function Two() {
  return (
    <MemoryRouter initialEntries={['/peers']}>
      <RouteChange />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route
            path="/peers"
            element={
              <>
                <h1>Peers</h1>
                <Link to="/chat">Chat</Link>
              </>
            }
          />
          <Route path="/chat" element={<h1>Chat</h1>} />
        </Routes>
      </main>
    </MemoryRouter>
  );
}

describe('a route change', () => {
  it('names the screen in the title, from its heading', async () => {
    render(<Two />);
    await waitFor(() => {
      expect(document.title).toBe('Peers · The SCI Club');
    });
    await userEvent.click(screen.getByRole('link', { name: 'Chat' }));
    await waitFor(() => {
      expect(document.title).toBe('Chat · The SCI Club');
    });
  });

  it('moves focus to the main landmark after a change, and not on the first screen', async () => {
    render(<Two />);
    await waitFor(() => {
      expect(document.title).toBe('Peers · The SCI Club');
    });
    // A page load announces itself; taking focus then would take it from the
    // address bar.
    expect(document.activeElement).not.toBe(screen.getByRole('main'));
    await userEvent.click(screen.getByRole('link', { name: 'Chat' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('main'));
    });
  });
});
